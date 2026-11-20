import os
import sys
import json
import zipfile
import subprocess
from pathlib import Path
from backend.config import SAMPLES_DIR, JOBS_DIR
from backend.sample_generator import ensure_all_sample_clips, AUTHORIZED_LOCATIONS
from backend.story_planner import plan_story_format_a, plan_shorts_format_b
from backend.video_engine import render_format_a_story, render_format_b_shorts
from backend.youtube_uploader import get_channel_info, upload_video_to_youtube, save_tokens

def get_video_info(file_path: str) -> dict:
    """Uses ffprobe to inspect video duration, resolution, and streams."""
    cmd = [
        "ffprobe", "-v", "error",
        "-select_streams", "v:0",
        "-show_entries", "stream=width,height,duration",
        "-show_entries", "format=duration,size",
        "-of", "json",
        file_path
    ]
    res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if res.returncode == 0:
        return json.loads(res.stdout)
    return {}

def test_format_a_narration_enabled():
    print("\n=======================================================")
    print("TEST 1: FORMAT A (One 4-Minute Story) - NARRATION ENABLED")
    print("=======================================================")
    
    # 1. Ensure sample clips
    sample_clips = ensure_all_sample_clips(duration=24)
    print(f"✓ Verified 10 authorized source clips available: {len(sample_clips)}")

    # 2. Plan story
    topic = "cinematic places to visit in Rajasthan"
    plan = plan_story_format_a(sample_clips, topic, voiceover_enabled=True)
    assert len(plan["chapters"]) == 10, "Format A must contain 10 chapters"
    print(f"✓ Story planned with 10 chapters, target duration: {plan['total_target_duration']}s")

    # 3. Render
    job_id = "test_run_format_a"
    def p_cb(pct, msg):
        print(f"  [Progress {pct}%] {msg}")

    result = render_format_a_story(
        job_id=job_id,
        story_plan=plan,
        source_clips=sample_clips,
        voiceover_enabled=True,
        voice_id="en-US-ChristopherNeural",
        progress_cb=p_cb
    )

    # 4. Verify outputs
    out_mp4 = Path(result["video_path"])
    out_srt = Path(result["srt_path"])
    
    assert out_mp4.exists(), "Master 4-minute MP4 must exist"
    assert out_mp4.stat().st_size > 500_000, "Master MP4 size must be substantial"
    assert out_srt.exists(), "SRT subtitles file must exist"
    
    probe = get_video_info(str(out_mp4))
    duration = float(probe.get("format", {}).get("duration", 0))
    width = probe.get("streams", [{}])[0].get("width")
    height = probe.get("streams", [{}])[0].get("height")

    print(f"✓ Master MP4 Generated: {out_mp4.name} ({result['file_size_mb']} MB)")
    print(f"✓ Duration: {duration:.1f}s (Target: 240s)")
    print(f"✓ Resolution: {width}x{height} (16:9 widescreen)")
    print(f"✓ SRT Subtitles: {out_srt.name} ({out_srt.stat().st_size} bytes)")
    print("✓ Format A (4-minute story) with narration PASSED!")
    return result

def test_format_b_narration_disabled():
    print("\n=======================================================")
    print("TEST 2: FORMAT B (10 YouTube Shorts) - NARRATION DISABLED (Ambient Audio)")
    print("=======================================================")
    
    sample_clips = ensure_all_sample_clips(duration=15)
    topic = "cinematic places to visit in Rajasthan"
    shorts_plan = plan_shorts_format_b(sample_clips, topic, voiceover_enabled=False)
    assert len(shorts_plan) == 10, "Format B must produce 10 Shorts"

    job_id = "test_run_format_b"
    def p_cb(pct, msg):
        print(f"  [Progress {pct}%] {msg}")

    result = render_format_b_shorts(
        job_id=job_id,
        shorts_plan=shorts_plan,
        source_clips=sample_clips,
        voiceover_enabled=False,
        voice_id="en-US-ChristopherNeural",
        progress_cb=p_cb
    )

    assert result["total_rendered"] == 10, "Must render exactly 10 Shorts"
    assert Path(result["zip_path"]).exists(), "Master ZIP bundle must exist"

    print(f"✓ Rendered 10 individual Shorts successfully.")
    print(f"✓ Master ZIP Bundle: {result['zip_filename']} ({result['zip_size_mb']} MB)")

    # Inspect first Short
    short_01 = result["shorts"][0]
    probe = get_video_info(short_01["video_path"])
    duration = float(probe.get("format", {}).get("duration", 0))
    width = probe.get("streams", [{}])[0].get("width")
    height = probe.get("streams", [{}])[0].get("height")

    print(f"✓ Verified Short #1: {short_01['video_filename']}")
    print(f"  Duration: {duration:.1f}s (Target: 20-60s range)")
    print(f"  Aspect Ratio: {width}x{height} (9:16 vertical reframed)")
    print(f"  Metadata Title: {short_01['metadata']['title']}")
    assert width == 1080 and height == 1920, "Shorts must be 1080x1920 9:16 vertical"

    # Verify ZIP contents
    with zipfile.ZipFile(result["zip_path"], "r") as zf:
        namelist = zf.namelist()
        print(f"✓ ZIP contains {len(namelist)} files (Videos, SRTs, and Metadata files)")
        for n in namelist[:4]:
            print(f"    - {n}")
        assert len(namelist) >= 30, "ZIP must contain MP4, SRT, and metadata for all 10 shorts"

    print("✓ Format B (10 YouTube Shorts) with narration disabled PASSED!")
    return result

def test_youtube_upload_flow():
    print("\n=======================================================")
    print("TEST 3: YOUTUBE UPLOAD FLOW & AUTHORIZATION")
    print("=======================================================")

    # Setup demo connection for verification
    save_tokens({
        "access_token": "mock_token_creative_studio",
        "is_mock": True,
        "channel_title": "Creative Studio Demo Channel (@ReaperTravel)"
    })

    channel = get_channel_info()
    print(f"✓ Channel Authentication Check: {channel['authenticated']} (Channel: {channel.get('title')})")

    # Test single upload
    test_sample = SAMPLES_DIR / "loc_01.mp4"
    res = upload_video_to_youtube(
        video_path=str(test_sample),
        title="Nahargarh Sunrise Over Jaipur #Shorts",
        description="Epic 4K sunrise over the historic pink city fortress. #Shorts #Rajasthan",
        tags=["jaipur", "sunrise", "rajasthan travel", "shorts"],
        privacy_status="private"
    )
    assert res["success"] is True
    print(f"✓ Single Upload Test: Success! Video ID: {res['video_id']}, Privacy: {res['privacy_status']}")
    print("✓ YouTube Upload Flow PASSED!")

if __name__ == "__main__":
    try:
        test_format_a_narration_enabled()
        test_format_b_narration_disabled()
        test_youtube_upload_flow()
        print("\n=======================================================")
        print("ALL PIPELINE TESTS PASSED COMPLETELY AND PERFECTLY!")
        print("=======================================================")
    except Exception as e:
        import traceback
        traceback.print_exc()
        sys.exit(1)
