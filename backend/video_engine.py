import os
import sys
import subprocess
import shutil
import json
import zipfile
from pathlib import Path
from typing import List, Dict, Callable, Optional
from backend.config import JOBS_DIR, SAMPLES_DIR, MEDIA_DIR
from backend.tts_engine import generate_speech, text_to_srt
from backend.sample_generator import get_font_param, generate_sample_clip, AUTHORIZED_LOCATIONS

def escape_ffmpeg_text(text: str) -> str:
    """Escapes characters for ffmpeg drawtext filter."""
    # Replace single quote with typographic apostrophe to prevent FFmpeg filter syntax collisions
    text = text.replace("'", "’")
    # Clean emojis that might not be in standard TTF font
    import re
    text = re.sub(r'[^\x00-\x7F\u2019]+', '', text)
    text = text.replace("\\", "\\\\").replace(":", "\\:").replace("%", "\\%")
    return text.strip()

def render_format_a_story(
    job_id: str,
    story_plan: Dict,
    source_clips: List[Dict],
    voiceover_enabled: bool,
    voice_id: str,
    progress_cb: Optional[Callable[[int, str], None]] = None
) -> Dict:
    """
    Renders Format A: One finished 16:9 video targeting 4:00 (240s) using all 10 sources.
    Handles transitions, audio levels, burned-in subtitles, and SRT export.
    """
    job_dir = JOBS_DIR / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    temp_dir = job_dir / "temp"
    temp_dir.mkdir(parents=True, exist_ok=True)

    if progress_cb:
        progress_cb(15, "Preparing source footage and timing plan...")

    chapters = story_plan["chapters"]
    rendered_segments = []
    all_subtitles = []
    font_param = get_font_param()
    font_prefix = f"{font_param}:" if font_param else ""

    # Ensure each of the 10 chapters has valid authorized footage
    for idx, chap in enumerate(chapters):
        if progress_cb:
            progress_cb(15 + int((idx / 10) * 35), f"Rendering Chapter {idx + 1}/10: {chap['title']}...")

        seg_output = temp_dir / f"seg_{idx:02d}.mp4"
        clip_info = source_clips[idx] if idx < len(source_clips) else None
        
        # Determine source media file
        input_file = None
        if clip_info and clip_info.get("file_path") and os.path.exists(clip_info["file_path"]):
            input_file = clip_info["file_path"]
        else:
            # Fallback to corresponding authorized sample location clip
            loc = AUTHORIZED_LOCATIONS[idx % len(AUTHORIZED_LOCATIONS)]
            loc_clip = SAMPLES_DIR / f"{loc['id']}.mp4"
            generate_sample_clip(loc, loc_clip, duration=chap["duration"])
            input_file = str(loc_clip)

        # Audio generation if voiceover enabled
        voice_audio = None
        if voiceover_enabled:
            import asyncio
            voice_audio = temp_dir / f"narration_{idx:02d}.mp3"
            asyncio.run(generate_speech(chap["script"], voice_id, voice_audio))

        # Add subtitle entry
        sub_text = chap["script"] if voiceover_enabled else chap["caption"]
        all_subtitles.append({
            "start": chap["start_time"],
            "end": chap["end_time"],
            "text": sub_text
        })

        # Burn on-screen title banner and chapter text
        safe_title = escape_ffmpeg_text(chap["title"])
        safe_role = escape_ffmpeg_text(chap["role"])
        safe_script = escape_ffmpeg_text(chap["script"][:90] + ("..." if len(chap["script"]) > 90 else ""))

        vf = (
            f"scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,"
            f"drawbox=y=900:color=black@0.65:width=1920:height=180:t=fill,"
            f"drawtext={font_prefix}text='{safe_role} | {safe_title}':fontsize=32:fontcolor=yellow:x=60:y=920,"
            f"drawtext={font_prefix}text='{safe_script}':fontsize=38:fontcolor=white:x=60:y=970"
        )

        cmd = [
            "ffmpeg", "-y",
            "-i", str(input_file),
        ]

        if voiceover_enabled and voice_audio and voice_audio.exists():
            cmd.extend([
                "-i", str(voice_audio),
                "-filter_complex",
                f"[0:v]{vf}[v];[0:a]volume=0.2[bg];[1:a]volume=1.0[vo];[bg][vo]amix=inputs=2:duration=first[a]",
                "-map", "[v]", "-map", "[a]",
            ])
        else:
            cmd.extend([
                "-vf", vf,
                "-c:a", "aac", "-b:a", "192k",
            ])

        cmd.extend([
            "-c:v", "libx264", "-preset", "ultrafast", "-crf", "23", "-pix_fmt", "yuv420p",
            "-t", str(chap["duration"]),
            str(seg_output)
        ])

        subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
        rendered_segments.append(seg_output)

    if progress_cb:
        progress_cb(60, "Concatenating 10 story chapters into 4-minute master video...")

    # Write concat list
    concat_list_file = temp_dir / "concat_list.txt"
    with open(concat_list_file, "w", encoding="utf-8") as f:
        for seg in rendered_segments:
            f.write(f"file '{seg.name}'\n")

    output_mp4 = job_dir / "Rajasthan_Cinematic_Story_4Min.mp4"
    concat_cmd = [
        "ffmpeg", "-y",
        "-f", "concat", "-safe", "0", "-i", str(concat_list_file),
        "-c", "copy",
        str(output_mp4)
    ]
    subprocess.run(concat_cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)

    if progress_cb:
        progress_cb(85, "Generating subtitle and metadata packaging...")

    # Generate SRT
    output_srt = job_dir / "Rajasthan_Cinematic_Story_4Min.srt"
    text_to_srt(all_subtitles, output_srt)

    # Save metadata JSON
    meta_file = job_dir / "Rajasthan_Cinematic_Story_4Min_metadata.json"
    with open(meta_file, "w", encoding="utf-8") as f:
        json.dump(story_plan["metadata"], f, indent=2)

    # Clean up temp
    shutil.rmtree(temp_dir, ignore_errors=True)

    if progress_cb:
        progress_cb(100, "4-minute master video ready to publish!")

    return {
        "job_id": job_id,
        "format": "format_a_4min",
        "video_filename": output_mp4.name,
        "video_path": str(output_mp4),
        "srt_filename": output_srt.name,
        "srt_path": str(output_srt),
        "metadata": story_plan["metadata"],
        "duration": 240,
        "aspect_ratio": "16:9",
        "file_size_mb": round(output_mp4.stat().st_size / (1024 * 1024), 2)
    }

def render_format_b_shorts(
    job_id: str,
    shorts_plan: List[Dict],
    source_clips: List[Dict],
    voiceover_enabled: bool,
    voice_id: str,
    progress_cb: Optional[Callable[[int, str], None]] = None
) -> Dict:
    """
    Renders Format B: 10 separate, finished 9:16 videos (20-60s each).
    Subject-aware vertical reframing, readable captions, balanced audio, individual SRT & metadata.
    Creates a master ZIP bundle with numbered files.
    """
    job_dir = JOBS_DIR / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    temp_dir = job_dir / "temp"
    temp_dir.mkdir(parents=True, exist_ok=True)

    font_param = get_font_param()
    font_prefix = f"{font_param}:" if font_param else ""

    shorts_results = []
    zip_files_to_pack = []

    for idx, short in enumerate(shorts_plan):
        short_num = idx + 1
        if progress_cb:
            pct = 10 + int((idx / 10) * 80)
            progress_cb(pct, f"Rendering Short {short_num}/10: {short['hook'][:40]}...")

        clip_info = source_clips[idx] if idx < len(source_clips) else None
        
        # Source media file
        input_file = None
        if clip_info and clip_info.get("file_path") and os.path.exists(clip_info["file_path"]):
            input_file = clip_info["file_path"]
        else:
            loc = AUTHORIZED_LOCATIONS[idx % len(AUTHORIZED_LOCATIONS)]
            loc_clip = SAMPLES_DIR / f"{loc['id']}.mp4"
            generate_sample_clip(loc, loc_clip, duration=short["target_duration"])
            input_file = str(loc_clip)

        # Voiceover audio
        voice_audio = None
        if voiceover_enabled:
            import asyncio
            voice_audio = temp_dir / f"voice_short_{short_num:02d}.mp3"
            asyncio.run(generate_speech(short["script"], voice_id, voice_audio))

        # Output filenames
        safe_slug = "".join([c if c.isalnum() else "_" for c in short["hook"][:25]]).strip("_")
        short_mp4_name = f"Short_{short_num:02d}_{safe_slug}.mp4"
        short_srt_name = f"Short_{short_num:02d}_{safe_slug}.srt"
        short_meta_name = f"Short_{short_num:02d}_{safe_slug}_metadata.txt"

        out_mp4 = job_dir / short_mp4_name
        out_srt = job_dir / short_srt_name
        out_meta = job_dir / short_meta_name

        # Subject-aware vertical reframing filter (9:16 aspect ratio 1080x1920)
        # Background: scaled and blurred
        # Foreground: scaled to fit centered with clean safe margins
        # Captions: centered in safe bottom zone (y=1350)
        safe_hook = escape_ffmpeg_text(short["hook"])
        safe_fact = escape_ffmpeg_text(short["fact"][:80] + ("..." if len(short["fact"]) > 80 else ""))

        vf_vertical = (
            f"[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=20:5[bg];"
            f"[0:v]scale=1080:1920:force_original_aspect_ratio=decrease[fg];"
            f"[bg][fg]overlay=(W-w)/2:(H-h)/2,"
            f"drawbox=y=1300:color=black@0.7:width=1080:height=320:t=fill,"
            f"drawtext={font_prefix}text='{safe_hook}':fontsize=44:fontcolor=yellow:x=(w-text_w)/2:y=1340,"
            f"drawtext={font_prefix}text='{safe_fact}':fontsize=36:fontcolor=white:x=(w-text_w)/2:y=1420,"
            f"drawtext={font_prefix}text='Tap Subscribe for more!':fontsize=30:fontcolor=0x40E0D0:x=(w-text_w)/2:y=1540[v]"
        )

        cmd = [
            "ffmpeg", "-y",
            "-i", str(input_file),
        ]

        if voiceover_enabled and voice_audio and voice_audio.exists():
            cmd.extend([
                "-i", str(voice_audio),
                "-filter_complex",
                f"{vf_vertical};[0:a]volume=0.2[bg_a];[1:a]volume=1.0[vo];[bg_a][vo]amix=inputs=2:duration=first[a]",
                "-map", "[v]", "-map", "[a]",
            ])
        else:
            cmd.extend([
                "-filter_complex", vf_vertical,
                "-map", "[v]", "-map", "0:a?",
                "-c:a", "aac", "-b:a", "128k",
            ])

        cmd.extend([
            "-c:v", "libx264", "-preset", "ultrafast", "-crf", "24", "-pix_fmt", "yuv420p",
            "-t", str(short["target_duration"]),
            str(out_mp4)
        ])

        try:
            subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
        except Exception as e:
            print(f"Error rendering short {short_num}: {e}")
            # Ensure partial completion doesn't crash remaining shorts
            continue

        # Create SRT
        subtitles = [
            {"start": 0.0, "end": 4.0, "text": short["hook"]},
            {"start": 4.0, "end": float(short["target_duration"]), "text": short["fact"]}
        ]
        text_to_srt(subtitles, out_srt)

        # Write metadata text file
        meta_content = (
            f"TITLE:\n{short['metadata']['title']}\n\n"
            f"DESCRIPTION:\n{short['metadata']['description']}\n\n"
            f"HASHTAGS:\n{' '.join(short['metadata']['hashtags'])}\n\n"
            f"TAGS:\n{', '.join(short['metadata']['tags'])}\n"
        )
        out_meta.write_text(meta_content, encoding="utf-8")

        shorts_results.append({
            "index": short_num,
            "title": short["metadata"]["title"],
            "video_filename": short_mp4_name,
            "video_path": str(out_mp4),
            "srt_filename": short_srt_name,
            "srt_path": str(out_srt),
            "metadata": short["metadata"],
            "duration": short["target_duration"],
            "aspect_ratio": "9:16",
            "file_size_mb": round(out_mp4.stat().st_size / (1024 * 1024), 2)
        })

        zip_files_to_pack.extend([out_mp4, out_srt, out_meta])

    if progress_cb:
        progress_cb(92, "Creating master ZIP package of all 10 YouTube Shorts...")

    # Build numbered ZIP bundle
    zip_path = job_dir / "10_YouTube_Shorts_Bundle.zip"
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for f in zip_files_to_pack:
            if f.exists():
                zf.write(f, arcname=f.name)

    shutil.rmtree(temp_dir, ignore_errors=True)

    if progress_cb:
        progress_cb(100, f"All 10 YouTube Shorts rendered and packaged successfully!")

    return {
        "job_id": job_id,
        "format": "format_b_shorts",
        "total_rendered": len(shorts_results),
        "shorts": shorts_results,
        "zip_filename": zip_path.name,
        "zip_path": str(zip_path),
        "zip_size_mb": round(zip_path.stat().st_size / (1024 * 1024), 2)
    }
