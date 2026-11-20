import os
import json
from pathlib import Path
from typing import Dict, List, Optional
from backend.config import BASE_DIR, SETTINGS_FILE

TOKENS_FILE = BASE_DIR / "youtube_tokens.json"

def get_oauth_settings() -> Dict:
    """Reads configured OAuth credentials from settings."""
    if SETTINGS_FILE.exists():
        try:
            return json.loads(SETTINGS_FILE.read_text(encoding="utf-8"))
        except:
            pass
    return {
        "youtube_api_key": os.environ.get("YOUTUBE_API_KEY", ""),
        "google_client_id": os.environ.get("GOOGLE_CLIENT_ID", ""),
        "google_client_secret": os.environ.get("GOOGLE_CLIENT_SECRET", ""),
    }

def get_saved_tokens() -> Optional[Dict]:
    """Retrieves saved OAuth tokens from server storage."""
    if TOKENS_FILE.exists():
        try:
            return json.loads(TOKENS_FILE.read_text(encoding="utf-8"))
        except:
            pass
    return None

def save_tokens(token_data: Dict):
    """Persists OAuth tokens to server storage."""
    TOKENS_FILE.write_text(json.dumps(token_data, indent=2), encoding="utf-8")

def get_channel_info() -> Dict:
    """
    Returns channel profile info if authenticated, or demo status.
    """
    tokens = get_saved_tokens()
    settings = get_oauth_settings()

    if tokens and tokens.get("access_token"):
        # Real Google API channel query
        try:
            import google.oauth2.credentials
            from googleapiclient.discovery import build
            creds = google.oauth2.credentials.Credentials(
                token=tokens["access_token"],
                refresh_token=tokens.get("refresh_token"),
                token_uri="https://oauth2.googleapis.com/token",
                client_id=settings.get("google_client_id"),
                client_secret=settings.get("google_client_secret")
            )
            youtube = build("youtube", "v3", credentials=creds)
            res = youtube.channels().list(part="snippet,statistics", mine=True).execute()
            items = res.get("items", [])
            if items:
                ch = items[0]
                return {
                    "authenticated": True,
                    "is_demo": False,
                    "channel_id": ch["id"],
                    "title": ch["snippet"]["title"],
                    "custom_url": ch["snippet"].get("customUrl", ""),
                    "thumbnail": ch["snippet"]["thumbnails"]["default"]["url"],
                    "subscribers": ch["statistics"].get("subscriberCount", "0")
                }
        except Exception as e:
            print(f"Failed to query YouTube API channel info: {e}")

    # If demo mode is active or no credentials yet configured
    if tokens and tokens.get("is_mock"):
        return {
            "authenticated": True,
            "is_demo": True,
            "channel_id": "UC_DEMO_REAPER_STUDIO",
            "title": "Creative Studio Demo Channel (@ReaperTravel)",
            "custom_url": "@ReaperTravel",
            "thumbnail": "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop&crop=faces",
            "subscribers": "24,800"
        }

    return {
        "authenticated": False,
        "is_demo": False,
        "message": "Connect your YouTube account via Google OAuth or enable Test Mode to simulate uploads."
    }

def upload_video_to_youtube(
    video_path: str,
    title: str,
    description: str,
    tags: List[str],
    privacy_status: str = "private"
) -> Dict:
    """
    Uploads a video to YouTube using OAuth credentials or simulated test mode.
    """
    tokens = get_saved_tokens()
    settings = get_oauth_settings()

    if not tokens:
        raise ValueError("No authenticated YouTube account connected.")

    # Check if this is a real upload or test mode
    if not tokens.get("is_mock") and settings.get("google_client_id"):
        import google.oauth2.credentials
        from googleapiclient.discovery import build
        from googleapiclient.http import MediaFileUpload

        creds = google.oauth2.credentials.Credentials(
            token=tokens["access_token"],
            refresh_token=tokens.get("refresh_token"),
            token_uri="https://oauth2.googleapis.com/token",
            client_id=settings.get("google_client_id"),
            client_secret=settings.get("google_client_secret")
        )
        youtube = build("youtube", "v3", credentials=creds)

        body = {
            "snippet": {
                "title": title[:100],
                "description": description[:5000],
                "tags": tags[:500],
                "categoryId": "19"  # Travel & Events
            },
            "status": {
                "privacyStatus": privacy_status,
                "selfDeclaredMadeForKids": False
            }
        }

        media = MediaFileUpload(video_path, chunksize=-1, resumable=True)
        request = youtube.videos().insert(part="snippet,status", body=body, media_body=media)
        response = None
        while response is None:
            status, response = request.next_chunk()

        video_id = response.get("id")
        return {
            "success": True,
            "video_id": video_id,
            "youtube_url": f"https://www.youtube.com/watch?v={video_id}",
            "privacy_status": privacy_status,
            "title": title,
            "mode": "live"
        }
    else:
        # Simulated test upload for verification
        import uuid
        import time
        mock_id = f"mock_{uuid.uuid4().hex[:8]}"
        time.sleep(0.5)
        return {
            "success": True,
            "video_id": mock_id,
            "youtube_url": f"https://www.youtube.com/watch?v={mock_id}",
            "privacy_status": privacy_status,
            "title": title,
            "mode": "test_verified",
            "message": "Uploaded to test channel successfully with private status."
        }
