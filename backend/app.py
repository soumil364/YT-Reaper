import os
import shutil
import json
from pathlib import Path
from typing import Optional, List
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks, Request
from fastapi.responses import FileResponse, JSONResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from backend.config import BASE_DIR, FRONTEND_DIR, JOBS_DIR, UPLOADS_DIR, SAMPLES_DIR, SETTINGS_FILE, DEFAULT_SETTINGS
from backend.discovery import discover_youtube_candidates
from backend.tts_engine import get_available_voices, generate_voice_preview
from backend.job_manager import create_job, start_job_in_background, get_job
from backend.youtube_uploader import get_channel_info, upload_video_to_youtube, save_tokens, get_oauth_settings

app = FastAPI(title="YT Reaper - Automated Video Production Platform")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount frontend files
app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")

@app.get("/", response_class=HTMLResponse)
async def serve_index():
    index_file = FRONTEND_DIR / "index.html"
    if not index_file.exists():
        raise HTTPException(status_code=404, detail="Frontend index.html not found")
    return HTMLResponse(content=index_file.read_text(encoding="utf-8"))

class DiscoverRequest(BaseModel):
    query: str

@app.post("/api/discover")
async def api_discover(req: DiscoverRequest):
    if not req.query or not req.query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty")
    settings = get_oauth_settings()
    api_key = settings.get("youtube_api_key") or None
    candidates = discover_youtube_candidates(req.query.strip(), api_key=api_key)
    return {
        "query": req.query,
        "count": len(candidates),
        "candidates": candidates
    }

@app.get("/api/voices")
async def api_voices():
    voices = await get_available_voices()
    return {"voices": voices}

@app.get("/api/voice-preview/{voice_id}")
async def api_voice_preview(voice_id: str):
    preview_path = await generate_voice_preview(voice_id)
    if not preview_path.exists():
        raise HTTPException(status_code=404, detail="Preview voice audio not found")
    return FileResponse(path=str(preview_path), media_type="audio/mpeg", filename=f"{voice_id}.mp3")

@app.post("/api/upload-footage")
async def api_upload_footage(files: List[UploadFile] = File(...)):
    saved_files = []
    for f in files:
        safe_name = "".join([c if c.isalnum() or c in "._-" else "_" for c in f.filename])
        dest_path = UPLOADS_DIR / safe_name
        with open(dest_path, "wb") as buffer:
            shutil.copyfileobj(f.file, buffer)
        saved_files.append({
            "original_name": f.filename,
            "filename": safe_name,
            "path": str(dest_path),
            "size_mb": round(dest_path.stat().st_size / (1024 * 1024), 2)
        })
    return {"uploaded": saved_files, "total": len(saved_files)}

class GenerateRequest(BaseModel):
    topic: str
    format_type: str  # 'format_a_4min' or 'format_b_shorts'
    voiceover_enabled: bool = True
    voice_id: str = "en-US-ChristopherNeural"
    uploaded_files: Optional[List[str]] = []
    sources: Optional[List[dict]] = []

@app.post("/api/generate")
async def api_generate(req: GenerateRequest):
    if not req.topic:
        raise HTTPException(status_code=400, detail="Topic or source link required")
    if req.format_type not in ["format_a_4min", "format_b_shorts"]:
        raise HTTPException(status_code=400, detail="Invalid format_type specified")

    job_id = create_job(
        topic=req.topic,
        format_type=req.format_type,
        voiceover_enabled=req.voiceover_enabled,
        voice_id=req.voice_id,
        uploaded_files=req.uploaded_files,
        pre_selected_sources=req.sources
    )

    start_job_in_background(job_id)
    return {"job_id": job_id, "status": "started", "message": "Rendering job started in background."}

@app.get("/api/jobs/{job_id}")
async def api_get_job(job_id: str):
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job

@app.get("/api/jobs/{job_id}/download/{filename}")
async def api_download_file(job_id: str, filename: str):
    file_path = JOBS_DIR / job_id / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Requested file not found")
    media_type = "application/octet-stream"
    if filename.endswith(".mp4"):
        media_type = "video/mp4"
    elif filename.endswith(".srt"):
        media_type = "text/plain"
    elif filename.endswith(".zip"):
        media_type = "application/zip"
    return FileResponse(path=str(file_path), media_type=media_type, filename=filename)

@app.get("/api/jobs/{job_id}/preview/{filename}")
async def api_preview_video(job_id: str, filename: str):
    file_path = JOBS_DIR / job_id / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Preview file not found")
    return FileResponse(path=str(file_path), media_type="video/mp4")

# YouTube Auth & Upload endpoints
@app.get("/api/auth/status")
async def api_auth_status():
    return get_channel_info()

@app.post("/api/auth/mock-connect")
async def api_auth_mock_connect():
    save_tokens({
        "access_token": "mock_token_creative_studio",
        "is_mock": True,
        "channel_title": "Creative Studio Demo Channel (@ReaperTravel)"
    })
    return get_channel_info()

@app.post("/api/auth/disconnect")
async def api_auth_disconnect():
    from backend.youtube_uploader import TOKENS_FILE
    if TOKENS_FILE.exists():
        TOKENS_FILE.unlink()
    return {"authenticated": False}

class UploadItem(BaseModel):
    video_path: str
    title: str
    description: str
    tags: List[str] = []
    privacy_status: str = "private"

class BatchUploadRequest(BaseModel):
    items: List[UploadItem]

@app.post("/api/youtube/upload")
async def api_youtube_upload(req: BatchUploadRequest):
    results = []
    for item in req.items:
        try:
            res = upload_video_to_youtube(
                video_path=item.video_path,
                title=item.title,
                description=item.description,
                tags=item.tags,
                privacy_status=item.privacy_status
            )
            results.append({"status": "success", "title": item.title, "result": res})
        except Exception as e:
            results.append({"status": "failed", "title": item.title, "error": str(e)})
    return {"results": results, "total": len(results)}

# Settings endpoints
@app.get("/api/settings")
async def api_get_settings():
    return get_oauth_settings()

@app.post("/api/settings")
async def api_update_settings(data: dict):
    current = get_oauth_settings()
    current.update(data)
    SETTINGS_FILE.write_text(json.dumps(current, indent=2), encoding="utf-8")
    return {"success": True, "settings": current}

# Health check
@app.get("/api/health")
async def api_health():
    return {"status": "ok", "app": "YT Reaper 2"}
