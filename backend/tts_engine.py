import asyncio
import os
import re
from pathlib import Path
from typing import List, Dict, Optional
import edge_tts
from backend.config import SAMPLES_DIR

# Common curated high-quality voices
POPULAR_VOICES = [
    {"id": "en-US-ChristopherNeural", "name": "Christopher (US Male - Deep & Engaging)", "lang": "English (US)", "locale": "en-US", "gender": "Male"},
    {"id": "en-US-JennyNeural", "name": "Jenny (US Female - Natural & Clear)", "lang": "English (US)", "locale": "en-US", "gender": "Female"},
    {"id": "en-US-GuyNeural", "name": "Guy (US Male - Narrative)", "lang": "English (US)", "locale": "en-US", "gender": "Male"},
    {"id": "en-US-AriaNeural", "name": "Aria (US Female - Expressive)", "lang": "English (US)", "locale": "en-US", "gender": "Female"},
    {"id": "en-GB-RyanNeural", "name": "Ryan (UK Male - Cinematic)", "lang": "English (UK)", "locale": "en-GB", "gender": "Male"},
    {"id": "en-GB-SoniaNeural", "name": "Sonia (UK Female - Documentary)", "lang": "English (UK)", "locale": "en-GB", "gender": "Female"},
    {"id": "en-IN-PrabhatNeural", "name": "Prabhat (India Male - Storyteller)", "lang": "English (India)", "locale": "en-IN", "gender": "Male"},
    {"id": "en-IN-NeerjaNeural", "name": "Neerja (India Female - Friendly)", "lang": "English (India)", "locale": "en-IN", "gender": "Female"},
    {"id": "hi-IN-MadhurNeural", "name": "Madhur (Hindi Male - Deep)", "lang": "Hindi (India)", "locale": "hi-IN", "gender": "Male"},
    {"id": "hi-IN-SwaraNeural", "name": "Swara (Hindi Female - Expressive)", "lang": "Hindi (India)", "locale": "hi-IN", "gender": "Female"},
    {"id": "es-ES-AlvaroNeural", "name": "Alvaro (Spanish Male - Travel)", "lang": "Spanish (Spain)", "locale": "es-ES", "gender": "Male"},
    {"id": "fr-FR-HenriNeural", "name": "Henri (French Male - Sophisticated)", "lang": "French (France)", "locale": "fr-FR", "gender": "Male"},
    {"id": "de-DE-KillianNeural", "name": "Killian (German Male - Clear)", "lang": "German (Germany)", "locale": "de-DE", "gender": "Male"},
    {"id": "ja-JP-KeitaNeural", "name": "Keita (Japanese Male - Calm)", "lang": "Japanese (Japan)", "locale": "ja-JP", "gender": "Male"},
]

PREVIEWS_DIR = SAMPLES_DIR / "voice_previews"
PREVIEWS_DIR.mkdir(parents=True, exist_ok=True)

async def get_available_voices() -> List[Dict]:
    """Returns curated voice list with language metadata."""
    return POPULAR_VOICES

async def generate_speech(text: str, voice: str, output_path: Path, rate: str = "+0%", pitch: str = "+0Hz") -> Path:
    """Generates audio speech using edge_tts with custom rate and pitch."""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    communicate = edge_tts.Communicate(text=text, voice=voice, rate=rate, pitch=pitch)
    await communicate.save(str(output_path))
    return output_path

async def generate_voice_preview(voice_id: str) -> Path:
    """Generates or returns a cached voice preview mp3."""
    preview_file = PREVIEWS_DIR / f"{voice_id}.mp3"
    if preview_file.exists() and preview_file.stat().st_size > 1000:
        return preview_file
    
    sample_texts = {
        "hi-IN": "नमस्ते, यह आपके वीडियो के लिए एआई वॉयसओवर का नमूना है।",
        "es-ES": "Hola, esta es una vista previa de la narración con inteligencia artificial para tus videos.",
        "fr-FR": "Bonjour, ceci est un aperçu de la voix off générée par intelligence artificielle.",
        "de-DE": "Hallo, dies ist eine Hörprobe für die Sprachausgabe Ihrer Videos.",
        "ja-JP": "こんにちは。これは動画用のAIナレーションのプレビューです。",
    }
    
    # Extract locale prefix
    locale = "-".join(voice_id.split("-")[:2])
    text = sample_texts.get(locale, "Welcome. This is a preview of the high quality AI voiceover for your video.")
    
    try:
        await generate_speech(text, voice_id, preview_file)
    except Exception as e:
        print(f"Error generating preview for {voice_id}: {e}")
        # Generate silence or fallback tone if network error
        if not preview_file.exists():
            import subprocess
            subprocess.run([
                "ffmpeg", "-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=2",
                "-c:a", "libmp3lame", "-b:a", "128k", str(preview_file)
            ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            
    return preview_file

def text_to_srt(subtitles: List[Dict], output_file: Path) -> Path:
    """Writes a formatted SRT subtitle file from list of {start, end, text}."""
    def format_timestamp(seconds: float) -> str:
        hours = int(seconds // 3600)
        minutes = int((seconds % 3600) // 60)
        secs = int(seconds % 60)
        millis = int((seconds - int(seconds)) * 1000)
        return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"

    lines = []
    for idx, sub in enumerate(subtitles, 1):
        start_ts = format_timestamp(sub["start"])
        end_ts = format_timestamp(sub["end"])
        lines.append(f"{idx}\n{start_ts} --> {end_ts}\n{sub['text']}\n")

    output_file.write_text("\n".join(lines), encoding="utf-8")
    return output_file
