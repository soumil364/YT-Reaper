# YT Reaper 2.0 — Automated Video Production Platform

Turn any YouTube URL (video, playlist, channel) or niche topic into ready-to-publish videos with zero manual timeline editing.

---

## 🌟 Key Features

### 1. Dual Format Production
- **Format A — One 4-Minute Master Story (16:9)**:
  - Paced 10-chapter structured narrative arc: opening hook, thematic progression, and satisfying conclusion.
  - Automatic audio ducking (narration balanced over ambient atmosphere).
  - Burned-in subtitles, standalone `.srt` files, and metadata packaging.
- **Format B — 10 YouTube Shorts (9:16)**:
  - 10 standalone vertical videos (20–60s) with subject-aware vertical reframing (blur-extended backgrounds with centered action safe zones).
  - High-contrast, mobile-safe captions.
  - Complete publishing packages (Titles, Descriptions, Hashtags, SEO tags) and one-click **"Download All (ZIP)"** bundle.

### 2. Multi-Lingual AI Narration
- Powered by `edge-tts` with 300+ neural voices across 14+ languages and accents (English, Hindi, Spanish, French, German, Japanese, etc.).
- Real-time audio preview player.
- Optional ambient audio mode (uses authentic audio tracks and concise on-screen text when narration is disabled).

### 3. Intelligent Discovery & Ranking
- Sourced via YouTube Data API v3 and scrapetube.
- Evaluated and ranked by **topic relevance**, **engagement relative to age** (views per day, like ratios), and **variety** (duplicate channel filtering).
- Separate tracking for discovered links and authorized footage files.

### 4. Direct YouTube Upload Pipeline
- Google OAuth 2.0 integration displaying destination channel details, subscriber count, and custom handles.
- Default **Private** privacy setting with explicit confirmation checks.
- Batch upload support with per-video success/error badges and retry handling.
- Simulated Demo Channel support for offline/sandbox testing.

---

## 🚀 Quick Start

### Prerequisites
- Python 3.10+
- FFmpeg installed and available on PATH
- Node.js (for tunnel deployment if needed)

### 1. Clone & Install
```bash
git clone https://github.com/soumil623-beep/YT-Reaper.git
cd YT-Reaper
pip install -r requirements.txt
```

### 2. Run the Server
```bash
python run_server.py
```
The application will be accessible at: `http://localhost:8000`

### 3. Run Automated Tests
```bash
python test_pipeline.py
```
Tests both Format A (narration on) and Format B (narration off), verifying duration, 9:16 reframing, `.srt` synchronization, and master ZIP packaging.

---

## 📁 Repository Structure

```
YT-Reaper/
├── backend/
│   ├── app.py                # FastAPI routes & static file handlers
│   ├── config.py             # Paths, directories, and default settings
│   ├── discovery.py          # YouTube API & scrapetube candidate discovery & ranking
│   ├── job_manager.py        # Background task queue & persistent job states
│   ├── sample_generator.py   # Procedural authorized HD sample footage generator
│   ├── story_planner.py      # Narrative hook sequencing & script generation
│   ├── tts_engine.py         # Multi-lingual neural text-to-speech engine
│   ├── video_engine.py       # FFmpeg video rendering (16:9 & 9:16 reframing, captions)
│   └── youtube_uploader.py   # OAuth2 YouTube publishing module
├── frontend/
│   ├── index.html            # Responsive UI (Tailwind CSS, Lucide icons, glassmorphism)
│   ├── styles.css            # Custom animations & mobile safe-zone mockups
│   └── app.js                # Asynchronous state management & polling logic
├── requirements.txt          # Python dependencies
├── run_server.py             # Server launcher script
├── test_pipeline.py          # End-to-end automated pipeline test suite
└── README.md
```
