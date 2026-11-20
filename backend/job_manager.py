import os
import json
import time
import uuid
import threading
from pathlib import Path
from typing import Dict, Optional, List
from backend.config import JOBS_DIR
from backend.discovery import discover_youtube_candidates
from backend.story_planner import plan_story_format_a, plan_shorts_format_b
from backend.video_engine import render_format_a_story, render_format_b_shorts
from backend.logger import add_server_log

jobs_lock = threading.Lock()
ACTIVE_JOBS: Dict[str, dict] = {}

def get_job_file(job_id: str) -> Path:
    return JOBS_DIR / job_id / "job_state.json"

def save_job_state(job_id: str, data: dict):
    with jobs_lock:
        ACTIVE_JOBS[job_id] = data
    job_dir = JOBS_DIR / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    f = get_job_file(job_id)
    f.write_text(json.dumps(data, indent=2, default=str), encoding="utf-8")

def get_job(job_id: str) -> Optional[dict]:
    with jobs_lock:
        if job_id in ACTIVE_JOBS:
            return ACTIVE_JOBS[job_id]
    
    f = get_job_file(job_id)
    if f.exists():
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
            with jobs_lock:
                ACTIVE_JOBS[job_id] = data
            return data
        except:
            pass
    return None

def create_job(
    topic: str,
    format_type: str,
    voiceover_enabled: bool,
    voice_id: str,
    uploaded_files: Optional[List[str]] = None,
    pre_selected_sources: Optional[List[dict]] = None
) -> str:
    job_id = f"job_{uuid.uuid4().hex[:10]}"
    job_state = {
        "job_id": job_id,
        "topic": topic,
        "format_type": format_type,
        "voiceover_enabled": voiceover_enabled,
        "voice_id": voice_id,
        "uploaded_files": uploaded_files or [],
        "sources": pre_selected_sources or [],
        "status": "pending",
        "progress": 0,
        "current_stage": "Initializing job...",
        "logs": [f"[{time.strftime('%H:%M:%S')}] Job created for '{topic}' ({format_type})"],
        "result": None,
        "error": None,
        "created_at": time.time(),
        "updated_at": time.time()
    }
    save_job_state(job_id, job_state)
    return job_id

def update_job_progress(job_id: str, progress: int, stage_message: str):
    job = get_job(job_id)
    if job:
        job["progress"] = progress
        job["current_stage"] = stage_message
        job["updated_at"] = time.time()
        job["logs"].append(f"[{time.strftime('%H:%M:%S')}] {stage_message}")
        save_job_state(job_id, job)
        add_server_log("INFO", "WORKER", f"[{job_id}] ({progress}%) {stage_message}", {"job_id": job_id, "progress": progress})

def run_job_worker(job_id: str):
    """
    Background worker that runs the full pipeline end-to-end:
    Discovery -> Footage Analysis -> Story Planning -> Video Rendering -> Packaging
    """
    try:
        job = get_job(job_id)
        if not job:
            return

        topic = job["topic"]
        format_type = job["format_type"]
        voiceover_enabled = job["voiceover_enabled"]
        voice_id = job["voice_id"]
        uploaded_files = job.get("uploaded_files", [])
        
        # Stage 1: Discovery
        update_job_progress(job_id, 5, "Discovering and ranking the best 10 source candidates...")
        sources = job.get("sources")
        if not sources or len(sources) < 10:
            sources = discover_youtube_candidates(topic)
            job["sources"] = sources
            save_job_state(job_id, job)

        # Stage 2: Footage Analysis & Source Matching
        update_job_progress(job_id, 12, "Analyzing footage availability and licensing...")
        from backend.sample_generator import ensure_all_sample_clips
        sample_clips = ensure_all_sample_clips(duration=30)
        
        # Match uploaded footage or licensed sources
        source_clips = []
        for idx, src in enumerate(sources):
            # Check if user uploaded a file for this slot
            if idx < len(uploaded_files) and os.path.exists(uploaded_files[idx]):
                source_clips.append({
                    "id": src["video_id"],
                    "title": src["title"],
                    "file_path": uploaded_files[idx],
                    "status": "uploaded_original"
                })
                src["footage_status"] = "uploaded"
                src["footage_file"] = uploaded_files[idx]
            else:
                # Use authorized licensed sample clip
                loc_clip = sample_clips[idx % len(sample_clips)]
                source_clips.append(loc_clip)
                src["footage_status"] = "licensed_ready"
                src["footage_file"] = loc_clip["file_path"]

        save_job_state(job_id, job)

        # Stage 3: Story Planning
        update_job_progress(job_id, 18, "Planning coherent story arc, pacing, and chapter hooks...")
        
        def progress_cb(pct, msg):
            update_job_progress(job_id, pct, msg)

        # Stage 4: Video Editing, Audio Ducking, and Rendering
        if format_type == "format_a_4min":
            story_plan = plan_story_format_a(sources, topic, voiceover_enabled)
            result = render_format_a_story(
                job_id=job_id,
                story_plan=story_plan,
                source_clips=source_clips,
                voiceover_enabled=voiceover_enabled,
                voice_id=voice_id,
                progress_cb=progress_cb
            )
        else:
            shorts_plan = plan_shorts_format_b(sources, topic, voiceover_enabled)
            result = render_format_b_shorts(
                job_id=job_id,
                shorts_plan=shorts_plan,
                source_clips=source_clips,
                voiceover_enabled=voiceover_enabled,
                voice_id=voice_id,
                progress_cb=progress_cb
            )

        job = get_job(job_id)
        job["status"] = "completed"
        job["progress"] = 100
        job["current_stage"] = "Rendering complete! Ready for download and publishing."
        job["result"] = result
        save_job_state(job_id, job)
        add_server_log("SUCCESS", "WORKER", f"[{job_id}] Video rendering completed successfully! Package ready.", {"job_id": job_id})

    except Exception as e:
        import traceback
        err_msg = f"{str(e)}\n{traceback.format_exc()}"
        print(f"Job {job_id} failed: {err_msg}")
        add_server_log("ERROR", "WORKER", f"[{job_id}] Rendering worker failed: {str(e)}", {"job_id": job_id, "error": str(e)})
        job = get_job(job_id)
        if job:
            job["status"] = "failed"
            job["error"] = str(e)
            job["current_stage"] = f"Failed: {str(e)}"
            job["logs"].append(f"[{time.strftime('%H:%M:%S')}] ERROR: {str(e)}")
            save_job_state(job_id, job)

def start_job_in_background(job_id: str):
    thread = threading.Thread(target=run_job_worker, args=(job_id,), daemon=True)
    thread.start()
    return thread
