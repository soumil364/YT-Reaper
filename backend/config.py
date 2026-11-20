import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
MEDIA_DIR = BASE_DIR / "media"
UPLOADS_DIR = MEDIA_DIR / "uploads"
SAMPLES_DIR = MEDIA_DIR / "samples"
JOBS_DIR = MEDIA_DIR / "jobs"
FRONTEND_DIR = BASE_DIR / "frontend"

for d in [UPLOADS_DIR, SAMPLES_DIR, JOBS_DIR]:
    d.mkdir(parents=True, exist_ok=True)

# Settings file to persist API keys, mock mode, etc.
SETTINGS_FILE = BASE_DIR / "settings.json"

DEFAULT_SETTINGS = {
    "youtube_api_key": os.environ.get("YOUTUBE_API_KEY", ""),
    "google_client_id": os.environ.get("GOOGLE_CLIENT_ID", ""),
    "google_client_secret": os.environ.get("GOOGLE_CLIENT_SECRET", ""),
    "default_voice": "en-US-ChristopherNeural",
    "default_language": "en-US",
    "test_mode": True,  # Enables instant preview & test authentication if keys not yet set
}
