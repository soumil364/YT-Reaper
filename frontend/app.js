// State Management
let currentJobId = null;
let pollInterval = null;
let uploadedFiles = [];
let availableVoices = [];
let currentJobResult = null;
let activeShortIndex = 0;
let channelInfo = { authenticated: false };

// Audio preview element
const previewAudio = new Audio();

document.addEventListener("DOMContentLoaded", async () => {
  lucide.createIcons();
  updateFormatUI();
  await loadVoices();
  await checkAuthStatus();
  await loadSettings();

  // Check if URL has ?job=
  const urlParams = new URLSearchParams(window.location.search);
  const jobIdParam = urlParams.get("job");
  if (jobIdParam) {
    currentJobId = jobIdParam;
    showView("viewProgress");
    startPollingJob(jobIdParam);
  } else {
    // Check localStorage
    const savedJob = localStorage.getItem("yt_reaper_active_job");
    if (savedJob) {
      currentJobId = savedJob;
    }
  }

  // Setup confirmation checkbox listener in upload modal
  const check = document.getElementById("modalUploadConfirmCheck");
  if (check) {
    check.addEventListener("change", (e) => {
      document.getElementById("modalConfirmUploadBtn").disabled = !e.target.checked;
    });
  }
});

// Navigation Views
function showView(viewId) {
  document.getElementById("viewStart").classList.add("hidden");
  document.getElementById("viewProgress").classList.add("hidden");
  document.getElementById("viewResults").classList.add("hidden");
  
  const target = document.getElementById(viewId);
  if (target) {
    target.classList.remove("hidden");
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
  lucide.createIcons();
}

function resetToStart() {
  if (pollInterval) clearInterval(pollInterval);
  currentJobId = null;
  localStorage.removeItem("yt_reaper_active_job");
  window.history.replaceState({}, document.title, window.location.pathname);
  showView("viewStart");
}

function setTopic(text) {
  document.getElementById("topicInput").value = text;
}

// Format Selector UI
function onFormatChange() {
  updateFormatUI();
}

function updateFormatUI() {
  const selected = document.querySelector('input[name="formatChoice"]:checked').value;
  const cardA = document.getElementById("formatACard");
  const cardB = document.getElementById("formatBCard");

  if (selected === "format_a_4min") {
    cardA.classList.add("border-rose-500", "bg-rose-500/5", "shadow-lg", "shadow-rose-950/40");
    cardA.classList.remove("border-slate-800", "bg-slate-950/40");
    cardB.classList.remove("border-amber-500", "bg-amber-500/5", "shadow-lg", "shadow-amber-950/40");
    cardB.classList.add("border-slate-800", "bg-slate-950/40");
  } else {
    cardB.classList.add("border-amber-500", "bg-amber-500/5", "shadow-lg", "shadow-amber-950/40");
    cardB.classList.remove("border-slate-800", "bg-slate-950/40");
    cardA.classList.remove("border-rose-500", "bg-rose-500/5", "shadow-lg", "shadow-rose-950/40");
    cardA.classList.add("border-slate-800", "bg-slate-950/40");
  }
}

// AI Voiceover Toggle
function onVoiceoverToggle() {
  const isEnabled = document.getElementById("voiceoverToggle").checked;
  const controls = document.getElementById("voiceControlsContainer");
  const notice = document.getElementById("voiceDisabledNotice");
  const subtext = document.getElementById("voiceoverSubtext");

  if (isEnabled) {
    controls.classList.remove("hidden");
    notice.classList.add("hidden");
    subtext.innerText = "Generates original grounded narration and times visuals to speech";
  } else {
    controls.classList.add("hidden");
    notice.classList.remove("hidden");
    subtext.innerText = "Builds video using authentic ambient sound and on-screen chapter text";
  }
}

// Voices Loading & Preview
async function loadVoices() {
  try {
    const res = await fetch("/api/voices");
    const data = await res.json();
    availableVoices = data.voices || [];
    
    const select = document.getElementById("voiceSelect");
    select.innerHTML = "";
    availableVoices.forEach(v => {
      const opt = document.createElement("option");
      opt.value = v.id;
      opt.textContent = `${v.name} (${v.lang})`;
      select.appendChild(opt);
    });
  } catch (err) {
    console.error("Error loading voices:", err);
  }
}

async function previewSelectedVoice() {
  const select = document.getElementById("voiceSelect");
  const voiceId = select.value;
  const btn = document.getElementById("previewVoiceBtn");
  btn.classList.add("opacity-60", "animate-pulse");

  try {
    previewAudio.src = `/api/voice-preview/${voiceId}`;
    await previewAudio.play();
  } catch (err) {
    console.error("Voice preview error:", err);
  } finally {
    btn.classList.remove("opacity-60", "animate-pulse");
  }
}

// Upload Footage Handling
async function handleFootageFiles(files) {
  if (!files || files.length === 0) return;
  
  const formData = new FormData();
  for (let i = 0; i < files.length; i++) {
    formData.append("files", files[i]);
  }

  const listContainer = document.getElementById("uploadedFilesList");
  listContainer.classList.remove("hidden");
  listContainer.innerHTML = `<div class="text-xs text-rose-400 animate-pulse">Uploading ${files.length} footage files...</div>`;

  try {
    const res = await fetch("/api/upload-footage", {
      method: "POST",
      body: formData
    });
    const data = await res.json();
    uploadedFiles = data.uploaded || [];

    listContainer.innerHTML = "";
    uploadedFiles.forEach(f => {
      const item = document.createElement("div");
      item.className = "flex items-center justify-between p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs";
      item.innerHTML = `
        <div class="flex items-center space-x-2 truncate">
          <i data-lucide="video" class="w-4 h-4 text-emerald-400 flex-shrink-0"></i>
          <span class="text-slate-200 font-medium truncate">${f.original_name}</span>
        </div>
        <span class="text-slate-400 font-mono text-[11px]">${f.size_mb} MB</span>
      `;
      listContainer.appendChild(item);
    });
    lucide.createIcons();
  } catch (err) {
    listContainer.innerHTML = `<div class="text-xs text-red-400">Failed to upload footage: ${err.message}</div>`;
  }
}

// Generate Videos Workflow
async function startGenerationWorkflow() {
  const topic = document.getElementById("topicInput").value.trim();
  if (!topic) {
    alert("Please enter a YouTube link or niche topic.");
    return;
  }

  const formatChoice = document.querySelector('input[name="formatChoice"]:checked').value;
  const voiceoverEnabled = document.getElementById("voiceoverToggle").checked;
  const voiceId = document.getElementById("voiceSelect").value;
  const uploadedPaths = uploadedFiles.map(f => f.path);

  const btn = document.getElementById("generateBtn");
  btn.disabled = true;
  btn.innerHTML = `<i data-lucide="loader-2" class="w-5 h-5 animate-spin"></i><span>Analyzing and Discovering Sources...</span>`;
  lucide.createIcons();

  try {
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic: topic,
        format_type: formatChoice,
        voiceover_enabled: voiceoverEnabled,
        voice_id: voiceId,
        uploaded_files: uploadedPaths
      })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Failed to start generation");

    currentJobId = data.job_id;
    localStorage.setItem("yt_reaper_active_job", currentJobId);
    window.history.replaceState({}, document.title, `?job=${currentJobId}`);

    showView("viewProgress");
    startPollingJob(currentJobId);

  } catch (err) {
    alert(`Generation error: ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i data-lucide="sparkles" class="w-5 h-5"></i><span>Generate videos</span>`;
    lucide.createIcons();
  }
}

// Background Job Polling
function startPollingJob(jobId) {
  if (pollInterval) clearInterval(pollInterval);
  document.getElementById("jobIdDisplay").innerText = `Job ID: ${jobId}`;

  let failedAttempts = 0;

  const poll = async () => {
    try {
      const res = await fetch(`/api/jobs/${jobId}`);
      if (!res.ok) {
        failedAttempts++;
        if (failedAttempts > 3) {
          const warnEl = document.getElementById("connectionWarnBadge");
          if (warnEl) warnEl.classList.remove("hidden");
        }
        return;
      }
      failedAttempts = 0;
      const warnEl = document.getElementById("connectionWarnBadge");
      if (warnEl) warnEl.classList.add("hidden");

      const job = await res.json();
      updateProgressUI(job);

      if (job.status === "completed") {
        clearInterval(pollInterval);
        currentJobResult = job;
        try {
          showView("viewResults");
          renderResults(job);
        } catch (e) {
          console.error("Error rendering results:", e);
          showView("viewResults");
        }
      } else if (job.status === "failed") {
        clearInterval(pollInterval);
        document.getElementById("progressTitle").innerText = "Rendering Encountered an Error";
        document.getElementById("currentStageText").innerText = job.error || "Unknown error";
        document.getElementById("progressBarFill").classList.replace("from-rose-600", "from-red-600");
      }
    } catch (err) {
      console.error("Polling error:", err);
      failedAttempts++;
      if (failedAttempts > 3) {
        const warnEl = document.getElementById("connectionWarnBadge");
        if (warnEl) warnEl.classList.remove("hidden");
      }
    }
  };

  poll();
  pollInterval = setInterval(poll, 1500);
}

function updateProgressUI(job) {
  const pct = job.progress || 0;
  document.getElementById("progressPercentText").innerText = `${pct}%`;
  document.getElementById("progressBarFill").style.width = `${pct}%`;
  document.getElementById("currentStageText").innerText = job.current_stage || "Processing...";

  // Update pipeline steps highlight
  const stepIds = ["step-discovery", "step-footage", "step-story", "step-edit", "step-captions", "step-export"];
  let activeIndex = 0;
  if (pct >= 10) activeIndex = 1;
  if (pct >= 18) activeIndex = 2;
  if (pct >= 50) activeIndex = 3;
  if (pct >= 75) activeIndex = 4;
  if (pct >= 90) activeIndex = 5;

  stepIds.forEach((sid, idx) => {
    const el = document.getElementById(sid);
    if (!el) return;
    if (idx <= activeIndex) {
      el.classList.add("border-rose-500/60", "bg-rose-500/10");
      el.querySelector("i").classList.remove("text-slate-500");
      el.querySelector("i").classList.add("text-rose-400");
      el.querySelector("p").classList.remove("text-slate-400");
      el.querySelector("p").classList.add("text-slate-200");
    }
  });

  // Update ready button area
  const readyBtnArea = document.getElementById("readyActionArea");
  if (readyBtnArea) {
    if (pct >= 100 || job.status === "completed") {
      readyBtnArea.classList.remove("hidden");
    } else {
      readyBtnArea.classList.add("hidden");
    }
  }

  // Update logs console
  const consoleEl = document.getElementById("logConsole");
  if (job.logs && job.logs.length > 0) {
    consoleEl.innerHTML = job.logs.map(log => `<div>${escapeHtml(log)}</div>`).join("");
    consoleEl.scrollTop = consoleEl.scrollHeight;
  }
}

// Render Results View
function renderResults(job) {
  const container = document.getElementById("resultsContainer");
  const result = job.result;
  if (!result) return;

  if (result.format === "format_a_4min") {
    // 16:9 Widescreen Story
    const meta = result.metadata || {};
    container.innerHTML = `
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        <!-- Video Player Column (7 cols) -->
        <div class="lg:col-span-7 space-y-4">
          <div class="rounded-3xl overflow-hidden border border-slate-800 bg-black aspect-video shadow-2xl relative group">
            <video 
              id="mainVideoPlayer" 
              src="/api/jobs/${job.job_id}/preview/${result.video_filename}" 
              controls 
              autoplay 
              class="w-full h-full object-contain"
            ></video>
          </div>

          <div class="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl bg-slate-900 border border-slate-800 text-xs">
            <div class="flex items-center space-x-4">
              <span class="text-slate-400"><strong class="text-white">Format:</strong> 16:9 Master Story</span>
              <span class="text-slate-400"><strong class="text-white">Duration:</strong> 4:00 (240s)</span>
              <span class="text-slate-400"><strong class="text-white">Size:</strong> ${result.file_size_mb} MB</span>
            </div>
            <div class="flex items-center space-x-2">
              <a href="/api/jobs/${job.job_id}/download/${result.video_filename}" class="px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 font-semibold text-white transition flex items-center space-x-1.5 shadow">
                <i data-lucide="download" class="w-3.5 h-3.5"></i>
                <span>Download MP4</span>
              </a>
              <a href="/api/jobs/${job.job_id}/download/${result.srt_filename}" class="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 font-semibold text-slate-300 border border-slate-700 transition flex items-center space-x-1.5">
                <i data-lucide="subtitles" class="w-3.5 h-3.5"></i>
                <span>SRT Subtitles</span>
              </a>
            </div>
          </div>
        </div>

        <!-- Publishing Package Column (5 cols) -->
        <div class="lg:col-span-5 space-y-5">
          <div class="p-6 rounded-3xl bg-slate-900/90 border border-slate-800 space-y-5">
            <div class="flex items-center justify-between border-b border-slate-800 pb-3">
              <h4 class="text-sm font-bold text-white uppercase tracking-wider flex items-center space-x-2">
                <i data-lucide="sparkles" class="w-4 h-4 text-amber-400"></i>
                <span>Publishing Package</span>
              </h4>
              <button onclick="openUploadModalForCurrent()" class="px-3.5 py-1.5 rounded-xl bg-red-600 hover:bg-red-500 text-xs font-bold text-white transition flex items-center space-x-1.5 shadow-lg shadow-red-950/40">
                <i data-lucide="youtube" class="w-3.5 h-3.5"></i>
                <span>Upload to YouTube</span>
              </button>
            </div>

            <!-- Title -->
            <div class="space-y-1.5">
              <div class="flex justify-between items-center text-xs">
                <span class="font-semibold text-slate-300">Video Title</span>
                <button onclick="copyCurrentTitle(this)" class="text-rose-400 hover:text-rose-300 flex items-center space-x-1">
                  <i data-lucide="copy" class="w-3 h-3"></i><span>Copy</span>
                </button>
              </div>
              <div class="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 select-all font-medium">
                ${escapeHtml(meta.title)}
              </div>
            </div>

            <!-- Description -->
            <div class="space-y-1.5">
              <div class="flex justify-between items-center text-xs">
                <span class="font-semibold text-slate-300">Description & Chapters</span>
                <button onclick="copyCurrentDescription(this)" class="text-rose-400 hover:text-rose-300 flex items-center space-x-1">
                  <i data-lucide="copy" class="w-3 h-3"></i><span>Copy</span>
                </button>
              </div>
              <div class="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300 select-all max-h-40 overflow-y-auto whitespace-pre-line font-mono text-[11px]">
                ${escapeHtml(meta.description)}
              </div>
            </div>

            <!-- Hashtags & Tags -->
            <div class="space-y-1.5">
              <div class="flex justify-between items-center text-xs">
                <span class="font-semibold text-slate-300">Hashtags & SEO Tags</span>
                <button onclick="copyCurrentTags(this)" class="text-rose-400 hover:text-rose-300 flex items-center space-x-1">
                  <i data-lucide="copy" class="w-3 h-3"></i><span>Copy Tags</span>
                </button>
              </div>
              <div class="flex flex-wrap gap-1.5">
                ${(meta.hashtags || []).map(h => `<span class="px-2 py-0.5 rounded-lg bg-slate-800 text-rose-300 text-[11px] font-medium border border-slate-700/60">${h}</span>`).join("")}
              </div>
            </div>

          </div>
        </div>

      </div>
    `;
  } else {
    // Format B: 10 YouTube Shorts
    const shorts = result.shorts || [];
    window.allCurrentShorts = shorts;
    activeShortIndex = 0;

    container.innerHTML = `
      <div class="space-y-6">
        
        <!-- Batch Action Bar -->
        <div class="flex flex-col sm:flex-row items-center justify-between gap-4 p-5 rounded-2xl bg-slate-900 border border-slate-800">
          <div>
            <h4 class="text-base font-bold text-white flex items-center space-x-2">
              <span>10 YouTube Shorts Generated</span>
              <span class="text-xs px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">9:16 Vertical Reframed</span>
            </h4>
            <p class="text-xs text-slate-400">Each Short is timed (20–60s) with subject-aware vertical reframing, burned-in captions, and individual metadata.</p>
          </div>

          <div class="flex items-center space-x-3 w-full sm:w-auto">
            <a href="/api/jobs/${job.job_id}/download/${result.zip_filename}" class="flex-1 sm:flex-initial px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 font-bold text-slate-950 text-xs transition flex items-center justify-center space-x-2 shadow-lg shadow-amber-950/40">
              <i data-lucide="archive" class="w-4 h-4"></i>
              <span>Download All (ZIP) [${result.zip_size_mb} MB]</span>
            </a>
            <button onclick="startBatchShortsUpload()" class="flex-1 sm:flex-initial px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 font-bold text-white text-xs transition flex items-center justify-center space-x-2 shadow-lg shadow-red-950/40">
              <i data-lucide="youtube" class="w-4 h-4"></i>
              <span>Batch Upload to YouTube</span>
            </button>
          </div>
        </div>

        <!-- Shorts Selector Pill Tabs -->
        <div class="flex overflow-x-auto gap-2 pb-2 scrollbar-thin" id="shortsPillsBar">
          ${shorts.map((s, idx) => `
            <button onclick="selectShort(${idx})" class="short-pill flex-shrink-0 px-4 py-2 rounded-xl text-xs font-semibold border transition ${idx === 0 ? 'bg-amber-500/10 border-amber-500 text-amber-300' : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'}" id="shortPill-${idx}">
              Short #${s.index}: ${escapeHtml(s.title.slice(0, 22))}...
            </button>
          `).join("")}
        </div>

        <!-- Active Short Showcase Area -->
        <div id="activeShortArea">
          <!-- Populated by selectShort(0) -->
        </div>

      </div>
    `;

    selectShort(0);
  }

  lucide.createIcons();
}

function selectShort(idx) {
  activeShortIndex = idx;
  const shorts = window.allCurrentShorts || [];
  const s = shorts[idx];
  if (!s) return;

  // Update pills styling
  document.querySelectorAll(".short-pill").forEach((pill, pidx) => {
    if (pidx === idx) {
      pill.className = "short-pill flex-shrink-0 px-4 py-2 rounded-xl text-xs font-semibold border transition bg-amber-500/10 border-amber-500 text-amber-300";
    } else {
      pill.className = "short-pill flex-shrink-0 px-4 py-2 rounded-xl text-xs font-semibold border transition bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700";
    }
  });

  const area = document.getElementById("activeShortArea");
  const meta = s.metadata || {};

  area.innerHTML = `
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      
      <!-- 9:16 Vertical Phone Showcase (5 cols) -->
      <div class="lg:col-span-5 flex justify-center">
        <div class="phone-mockup border-4 border-slate-800 w-full max-w-[300px]">
          <video 
            id="shortVideoPlayer" 
            src="/api/jobs/${currentJobResult.job_id}/preview/${s.video_filename}" 
            controls 
            autoplay 
            loop 
            class="w-full h-full object-cover"
          ></video>
        </div>
      </div>

      <!-- Publishing Details for Active Short (7 cols) -->
      <div class="lg:col-span-7 space-y-4">
        <div class="p-6 rounded-3xl bg-slate-900/90 border border-slate-800 space-y-4">
          
          <div class="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <span class="text-xs px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/30">Short #${s.index} of 10</span>
              <h3 class="text-base font-bold text-white mt-1">${escapeHtml(s.title)}</h3>
            </div>
            <button onclick="openUploadModalForCurrent()" class="px-3.5 py-1.5 rounded-xl bg-red-600 hover:bg-red-500 text-xs font-bold text-white transition flex items-center space-x-1.5 shadow">
              <i data-lucide="youtube" class="w-3.5 h-3.5"></i>
              <span>Upload This Short</span>
            </button>
          </div>

          <!-- Title -->
          <div class="space-y-1">
            <div class="flex justify-between items-center text-xs">
              <span class="font-semibold text-slate-300">Short Title</span>
              <button onclick="copyCurrentTitle(this)" class="text-amber-400 hover:text-amber-300 flex items-center space-x-1">
                <i data-lucide="copy" class="w-3 h-3"></i><span>Copy</span>
              </button>
            </div>
            <div class="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 select-all font-medium">
              ${escapeHtml(meta.title)}
            </div>
          </div>

          <!-- Description -->
          <div class="space-y-1">
            <div class="flex justify-between items-center text-xs">
              <span class="font-semibold text-slate-300">Description & Tags</span>
              <button onclick="copyCurrentDescription(this)" class="text-amber-400 hover:text-amber-300 flex items-center space-x-1">
                <i data-lucide="copy" class="w-3 h-3"></i><span>Copy</span>
              </button>
            </div>
            <div class="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300 select-all max-h-32 overflow-y-auto whitespace-pre-line font-mono text-[11px]">
              ${escapeHtml(meta.description)}
            </div>
          </div>

          <!-- Download Action Bar -->
          <div class="flex items-center space-x-3 pt-2">
            <a href="/api/jobs/${currentJobResult.job_id}/download/${s.video_filename}" class="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 font-bold text-slate-950 text-xs transition flex items-center space-x-1.5">
              <i data-lucide="download" class="w-3.5 h-3.5"></i>
              <span>Download MP4 (${s.file_size_mb} MB)</span>
            </a>
            <a href="/api/jobs/${currentJobResult.job_id}/download/${s.srt_filename}" class="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 font-semibold text-slate-300 border border-slate-700 text-xs transition flex items-center space-x-1.5">
              <i data-lucide="subtitles" class="w-3.5 h-3.5"></i>
              <span>Download SRT</span>
            </a>
          </div>

        </div>
      </div>

    </div>
  `;

  lucide.createIcons();
}

// YouTube Auth & Modals
async function checkAuthStatus() {
  try {
    const res = await fetch("/api/auth/status");
    channelInfo = await res.json();
    const btnLabel = document.getElementById("ytAccountLabel");
    
    if (channelInfo.authenticated) {
      btnLabel.innerText = channelInfo.title || "Connected Channel";
      btnLabel.parentElement.classList.replace("border-slate-700", "border-emerald-500/50");
      btnLabel.parentElement.classList.add("bg-emerald-500/10", "text-emerald-300");
    } else {
      btnLabel.innerText = "Connect YouTube";
    }
  } catch (err) {
    console.error("Auth check error:", err);
  }
}

function openAuthModal() {
  openSettingsModal();
}

let activeUploadPayload = null;

function openUploadModal(videoPath, title, description) {
  activeUploadPayload = {
    video_path: videoPath,
    title: title,
    description: description,
    tags: ["rajasthan travel", "shorts", "explore", "video"]
  };

  document.getElementById("modalUploadTitle").value = title;
  document.getElementById("modalUploadDesc").value = description;
  document.getElementById("modalUploadConfirmCheck").checked = false;
  document.getElementById("modalConfirmUploadBtn").disabled = true;

  if (channelInfo && channelInfo.authenticated) {
    document.getElementById("uploadModalChannelTitle").innerText = channelInfo.title;
    document.getElementById("uploadModalChannelSub").innerText = `${channelInfo.custom_url || '@channel'} • ${channelInfo.subscribers || '0'} subscribers`;
    if (channelInfo.thumbnail) {
      document.getElementById("uploadModalChannelAvatar").src = channelInfo.thumbnail;
    }
  }

  document.getElementById("uploadModal").classList.remove("hidden");
  lucide.createIcons();
}

function closeUploadModal() {
  document.getElementById("uploadModal").classList.add("hidden");
}

async function executeYouTubeUpload() {
  const btn = document.getElementById("modalConfirmUploadBtn");
  btn.disabled = true;
  btn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i><span>Uploading to YouTube...</span>`;
  lucide.createIcons();

  const title = document.getElementById("modalUploadTitle").value;
  const description = document.getElementById("modalUploadDesc").value;
  const privacy = document.getElementById("modalUploadPrivacy").value;

  try {
    const res = await fetch("/api/youtube/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [{
          video_path: activeUploadPayload.video_path,
          title: title,
          description: description,
          tags: activeUploadPayload.tags,
          privacy_status: privacy
        }]
      })
    });
    const data = await res.json();
    const result = data.results[0];

    if (result.status === "success") {
      alert(`Success! Uploaded to YouTube:\n${result.result.title}\nPrivacy: ${result.result.privacy_status}\nURL: ${result.result.youtube_url}`);
      closeUploadModal();
    } else {
      alert(`Upload failed: ${result.error}`);
    }
  } catch (err) {
    alert(`Upload error: ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i data-lucide="upload" class="w-4 h-4"></i><span>Confirm & Upload</span>`;
    lucide.createIcons();
  }
}

async function startBatchShortsUpload() {
  const shorts = window.allCurrentShorts || [];
  if (shorts.length === 0) return;

  const confirmBatch = confirm(`Upload all ${shorts.length} YouTube Shorts to your connected channel in Private mode?`);
  if (!confirmBatch) return;

  const items = shorts.map(s => ({
    video_path: s.video_path,
    title: s.metadata.title,
    description: s.metadata.description,
    tags: s.metadata.tags || [],
    privacy_status: "private"
  }));

  try {
    const res = await fetch("/api/youtube/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: items })
    });
    const data = await res.json();
    const succeeded = data.results.filter(r => r.status === "success").length;
    alert(`Batch upload complete!\n${succeeded} of ${data.results.length} uploaded successfully in Private mode.`);
  } catch (err) {
    alert(`Batch upload error: ${err.message}`);
  }
}

// Settings Modal
async function loadSettings() {
  try {
    const res = await fetch("/api/settings");
    const data = await res.json();
    document.getElementById("settingsYtApiKey").value = data.youtube_api_key || "";
    document.getElementById("settingsClientId").value = data.google_client_id || "";
    document.getElementById("settingsClientSecret").value = data.google_client_secret || "";
  } catch (err) {
    console.error("Error loading settings:", err);
  }
}

function openSettingsModal() {
  document.getElementById("settingsModal").classList.remove("hidden");
  loadSettings();
  lucide.createIcons();
}

function closeSettingsModal() {
  document.getElementById("settingsModal").classList.add("hidden");
}

async function saveSettings() {
  const apiKey = document.getElementById("settingsYtApiKey").value.trim();
  const clientId = document.getElementById("settingsClientId").value.trim();
  const clientSecret = document.getElementById("settingsClientSecret").value.trim();

  try {
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        youtube_api_key: apiKey,
        google_client_id: clientId,
        google_client_secret: clientSecret
      })
    });
    alert("Settings saved successfully.");
    closeSettingsModal();
    checkAuthStatus();
  } catch (err) {
    alert(`Error saving settings: ${err.message}`);
  }
}

async function enableDemoChannel() {
  try {
    await fetch("/api/auth/mock-connect", { method: "POST" });
    await checkAuthStatus();
    alert("Simulated Demo YouTube channel connected! You can now test single and batch uploads.");
    closeSettingsModal();
  } catch (err) {
    alert(`Error enabling demo channel: ${err.message}`);
  }
}

function openUploadModalForCurrent() {
  if (!currentJobResult) return;
  const res = currentJobResult.result || {};
  if (currentJobResult.format_type === "format_a_4min" || res.format === "format_a_4min") {
    const meta = res.metadata || {};
    openUploadModal(res.video_path, meta.title || "Video", meta.description || "");
  } else {
    const shorts = window.allCurrentShorts || [];
    const s = shorts[activeShortIndex];
    if (!s) return;
    const meta = s.metadata || {};
    openUploadModal(s.video_path, meta.title || "Short", meta.description || "");
  }
}

function copyCurrentTitle(btn) {
  if (!currentJobResult) return;
  const res = currentJobResult.result || {};
  let title = "";
  if (currentJobResult.format_type === "format_a_4min" || res.format === "format_a_4min") {
    title = (res.metadata || {}).title || "";
  } else {
    const s = (window.allCurrentShorts || [])[activeShortIndex];
    title = s ? (s.metadata || {}).title || "" : "";
  }
  copyToClipboard(title, btn);
}

function copyCurrentDescription(btn) {
  if (!currentJobResult) return;
  const res = currentJobResult.result || {};
  let desc = "";
  if (currentJobResult.format_type === "format_a_4min" || res.format === "format_a_4min") {
    desc = (res.metadata || {}).description || "";
  } else {
    const s = (window.allCurrentShorts || [])[activeShortIndex];
    desc = s ? (s.metadata || {}).description || "" : "";
  }
  copyToClipboard(desc, btn);
}

function copyCurrentTags(btn) {
  if (!currentJobResult) return;
  const res = currentJobResult.result || {};
  let tags = "";
  if (currentJobResult.format_type === "format_a_4min" || res.format === "format_a_4min") {
    tags = ((res.metadata || {}).tags || []).join(", ");
  } else {
    const s = (window.allCurrentShorts || [])[activeShortIndex];
    tags = s ? ((s.metadata || {}).tags || []).join(", ") : "";
  }
  copyToClipboard(tags, btn);
}

// Helpers
function copyToClipboard(text, btnEl) {
  navigator.clipboard.writeText(text).then(() => {
    const orig = btnEl.innerHTML;
    btnEl.innerHTML = `<i data-lucide="check" class="w-3 h-3 text-emerald-400"></i><span class="text-emerald-400">Copied!</span>`;
    lucide.createIcons();
    setTimeout(() => {
      btnEl.innerHTML = orig;
      lucide.createIcons();
    }, 2000);
  });
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
