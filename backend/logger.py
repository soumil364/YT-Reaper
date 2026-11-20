import time
import threading
from collections import deque
from typing import List, Dict, Optional

_log_lock = threading.Lock()
_LOG_ENTRIES = deque(maxlen=1000)

def add_server_log(level: str, category: str, message: str, meta: Optional[dict] = None):
    entry = {
        "id": f"log_{int(time.time()*1000)}_{len(_LOG_ENTRIES)}",
        "timestamp": time.strftime("%H:%M:%S"),
        "datetime": time.strftime("%Y-%m-%d %H:%M:%S"),
        "epoch": time.time(),
        "level": level.upper(),  # INFO, WARN, ERROR, SUCCESS
        "category": category,    # HTTP, WORKER, FFMPEG, AUTH, SYSTEM
        "message": message,
        "meta": meta or {}
    }
    with _log_lock:
        _LOG_ENTRIES.append(entry)

def get_server_logs(limit: int = 300, category: Optional[str] = None, level: Optional[str] = None) -> List[Dict]:
    with _log_lock:
        entries = list(_LOG_ENTRIES)
    if category:
        entries = [e for e in entries if e["category"].lower() == category.lower()]
    if level:
        entries = [e for e in entries if e["level"].lower() == level.lower()]
    return entries[-limit:]

def clear_server_logs():
    with _log_lock:
        _LOG_ENTRIES.clear()
