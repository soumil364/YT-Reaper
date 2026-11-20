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

/* ==========================================================================
   DEVELOPER CONSOLE (Shortcut: Ctrl + Z + Z)
   Captures Console, Network (Fetch), Backend Server Logs & Job Diagnostics
   ========================================================================== */

const devLogStore = [];
let devErrorCount = 0;
let isDevConsoleOpen = false;
let isDevConsoleMaximized = false;
let currentDevFilter = "all";
let devServerPollInterval = null;
let lastSeenServerLogId = null;
let recentDevJobs = [];

// Push a log into dev store
function pushDevLog(type, level, message, details = null) {
  const d = new Date();
  const timeStr = d.toTimeString().split(" ")[0] + "." + String(d.getMilliseconds()).padStart(3, "0");
  const entry = {
    id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    time: timeStr,
    timestamp: Date.now(),
    type: type.toLowerCase(),   // 'console', 'network', 'server', 'worker', 'job'
    level: level.toLowerCase(), // 'info', 'warn', 'error', 'success'
    message: String(message),
    details: details
  };

  devLogStore.push(entry);
  if (devLogStore.length > 2000) devLogStore.shift();

  if (entry.level === "error") {
    devErrorCount++;
    const badge = document.getElementById("devErrorCounterBadge");
    if (badge) {
      badge.innerText = devErrorCount;
      badge.classList.remove("hidden");
    }
    const dot = document.getElementById("devConsoleDot");
    if (dot) {
      dot.classList.remove("bg-emerald-400");
      dot.classList.add("bg-red-500");
    }
  }

  updateDevCounts();

  if (isDevConsoleOpen && currentDevFilter !== "jobs") {
    if (matchesDevFilter(entry, currentDevFilter)) {
      appendDevLogDOM(entry);
    }
  }
}

// Intercept browser console
(function initConsoleInterceptor() {
  const origLog = console.log;
  const origWarn = console.warn;
  const origError = console.error;
  const origInfo = console.info;

  console.log = function(...args) {
    origLog.apply(console, args);
    const msg = args.map(a => typeof a === "object" ? JSON.stringify(a) : a).join(" ");
    pushDevLog("console", "info", msg);
  };
  console.info = function(...args) {
    origInfo.apply(console, args);
    const msg = args.map(a => typeof a === "object" ? JSON.stringify(a) : a).join(" ");
    pushDevLog("console", "info", msg);
  };
  console.warn = function(...args) {
    origWarn.apply(console, args);
    const msg = args.map(a => typeof a === "object" ? JSON.stringify(a) : a).join(" ");
    pushDevLog("console", "warn", msg);
  };
  console.error = function(...args) {
    origError.apply(console, args);
    const msg = args.map(a => typeof a === "object" ? (a && a.stack ? a.stack : JSON.stringify(a)) : a).join(" ");
    pushDevLog("console", "error", msg);
  };

  window.addEventListener("error", (e) => {
    pushDevLog("console", "error", `Uncaught Script Error: ${e.message} (${e.filename}:${e.lineno}:${e.colno})`);
  });
  window.addEventListener("unhandledrejection", (e) => {
    const reason = e.reason ? (e.reason.stack || e.reason.message || JSON.stringify(e.reason)) : "Unknown rejection";
    pushDevLog("console", "error", `Unhandled Promise Rejection: ${reason}`);
  });
})();

// Intercept window.fetch for network logging
(function initFetchInterceptor() {
  const origFetch = window.fetch;
  window.fetch = async function(...args) {
    const rawUrl = typeof args[0] === "string" ? args[0] : (args[0] && args[0].url ? args[0].url : "unknown");
    const method = (args[1] && args[1].method) ? args[1].method.toUpperCase() : "GET";
    const startTime = performance.now();

    // Skip dev log endpoint to avoid recursion
    if (rawUrl.includes("/api/dev/logs")) {
      return origFetch.apply(this, args);
    }

    try {
      const res = await origFetch.apply(this, args);
      const duration = Math.round(performance.now() - startTime);
      const lvl = res.ok ? (res.status >= 300 ? "warn" : "info") : "error";
      pushDevLog("network", lvl, `${method} ${rawUrl} -> ${res.status} ${res.statusText} (${duration}ms)`, {
        method, url: rawUrl, status: res.status, statusText: res.statusText, duration
      });
      return res;
    } catch (err) {
      const duration = Math.round(performance.now() - startTime);
      pushDevLog("network", "error", `${method} ${rawUrl} FAILED (${duration}ms) - ${err.message}`, {
        method, url: rawUrl, error: err.message, duration
      });
      throw err;
    }
  };
})();

// Shortcut listener: Ctrl + Z + Z
(function initShortcutListener() {
  let lastZTime = 0;

  window.addEventListener("keydown", (e) => {
    const isCtrl = e.ctrlKey || e.metaKey;

    // Detect Z key
    if (e.key === "z" || e.key === "Z") {
      const now = Date.now();
      // If Ctrl was held or recently active, and another Z is pressed within 750ms
      if (isCtrl || (now - lastZTime < 750)) {
        if (now - lastZTime < 750) {
          // Double-tap Z with Ctrl detected!
          e.preventDefault();
          toggleDevConsole();
          lastZTime = 0;
          return;
        } else if (isCtrl) {
          lastZTime = now;
        }
      }
    }

    // Escape closes dev console
    if (e.key === "Escape" && isDevConsoleOpen) {
      closeDevConsole();
    }
  });
})();

// Dev Console UI Controls
function toggleDevConsole() {
  if (isDevConsoleOpen) {
    closeDevConsole();
  } else {
    openDevConsole();
  }
}

function openDevConsole() {
  const container = document.getElementById("devConsoleContainer");
  if (!container) return;
  isDevConsoleOpen = true;
  container.classList.remove("dev-console-hidden");
  container.classList.add("dev-console-visible");

  // Update active job indicator
  const activeJobEl = document.getElementById("devActiveJobId");
  if (activeJobEl) {
    activeJobEl.innerText = currentJobId || (currentJobResult ? currentJobResult.job_id : "None");
  }

  renderDevLogs();
  fetchServerDevLogs();

  // Start polling server logs while open
  if (devServerPollInterval) clearInterval(devServerPollInterval);
  devServerPollInterval = setInterval(fetchServerDevLogs, 2500);
}

function closeDevConsole() {
  const container = document.getElementById("devConsoleContainer");
  if (!container) return;
  isDevConsoleOpen = false;
  container.classList.remove("dev-console-visible");
  container.classList.add("dev-console-hidden");

  if (devServerPollInterval) {
    clearInterval(devServerPollInterval);
    devServerPollInterval = null;
  }
}

function toggleDevConsoleMaximize() {
  const container = document.getElementById("devConsoleContainer");
  const btn = document.getElementById("devMaximizeBtn");
  if (!container) return;
  isDevConsoleMaximized = !isDevConsoleMaximized;
  if (isDevConsoleMaximized) {
    container.classList.add("dev-console-maximized");
    if (btn) btn.innerText = "⤓";
  } else {
    container.classList.remove("dev-console-maximized");
    if (btn) btn.innerText = "⤢";
  }
}

function setDevLogFilter(filterName) {
  currentDevFilter = filterName;

  // Update tab button highlights
  const tabs = ["all", "console", "network", "server", "errors", "jobs"];
  tabs.forEach(t => {
    const el = document.getElementById(`devTab-${t}`);
    if (!el) return;
    if (t === filterName) {
      el.className = "px-2 py-1 rounded bg-rose-500/20 text-rose-300 font-semibold border border-rose-500/30";
    } else {
      el.className = "px-2 py-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800";
    }
  });

  const logsEl = document.getElementById("devLogsOutput");
  const jobsEl = document.getElementById("devJobsOutput");

  if (filterName === "jobs") {
    if (logsEl) logsEl.classList.add("hidden");
    if (jobsEl) jobsEl.classList.remove("hidden");
    renderDevJobsPanel();
  } else {
    if (jobsEl) jobsEl.classList.add("hidden");
    if (logsEl) logsEl.classList.remove("hidden");
    renderDevLogs();
  }
}

function matchesDevFilter(entry, filter) {
  if (filter === "all") return true;
  if (filter === "console") return entry.type === "console";
  if (filter === "network") return entry.type === "network";
  if (filter === "server") return entry.type === "server" || entry.type === "worker";
  if (filter === "errors") return entry.level === "error" || entry.level === "warn";
  return true;
}

function updateDevCounts() {
  const counts = {
    all: devLogStore.length,
    console: devLogStore.filter(e => e.type === "console").length,
    network: devLogStore.filter(e => e.type === "network").length,
    server: devLogStore.filter(e => e.type === "server" || e.type === "worker").length,
    errors: devLogStore.filter(e => e.level === "error" || e.level === "warn").length,
    jobs: recentDevJobs.length
  };

  for (const [k, v] of Object.entries(counts)) {
    const el = document.getElementById(`devCount-${k}`);
    if (el) el.innerText = v;
  }
}

function appendDevLogDOM(entry) {
  const output = document.getElementById("devLogsOutput");
  if (!output) return;

  const row = createDevLogRow(entry);
  output.appendChild(row);

  const autoScroll = document.getElementById("devAutoScrollToggle");
  if (autoScroll && autoScroll.checked) {
    output.scrollTop = output.scrollHeight;
  }
}

function createDevLogRow(entry) {
  const div = document.createElement("div");
  div.className = `dev-log-row log-${entry.level}`;

  let badgeColor = "bg-slate-800 text-slate-300 border border-slate-700";
  if (entry.type === "network") badgeColor = "bg-cyan-950/80 text-cyan-300 border border-cyan-800/60";
  else if (entry.type === "server" || entry.type === "worker") badgeColor = "bg-purple-950/80 text-purple-300 border border-purple-800/60";
  else if (entry.type === "console") badgeColor = "bg-slate-900 text-slate-400 border border-slate-800";

  let levelBadgeColor = "text-slate-400";
  if (entry.level === "error") levelBadgeColor = "text-red-400 font-bold";
  else if (entry.level === "warn") levelBadgeColor = "text-amber-400 font-bold";
  else if (entry.level === "success") levelBadgeColor = "text-emerald-400 font-bold";

  div.innerHTML = `
    <span class="text-slate-600 select-none">${entry.time}</span>
    <span class="dev-badge ${badgeColor}">${escapeHtml(entry.type)}</span>
    <span class="dev-badge ${levelBadgeColor}">${escapeHtml(entry.level)}</span>
    <span class="flex-1 select-text">${escapeHtml(entry.message)}</span>
  `;

  return div;
}

function renderDevLogs() {
  const output = document.getElementById("devLogsOutput");
  if (!output) return;

  const searchQuery = (document.getElementById("devLogSearchInput")?.value || "").toLowerCase().trim();

  output.innerHTML = "";
  const filtered = devLogStore.filter(entry => {
    if (!matchesDevFilter(entry, currentDevFilter)) return false;
    if (searchQuery) {
      const matchMsg = entry.message.toLowerCase().includes(searchQuery);
      const matchType = entry.type.toLowerCase().includes(searchQuery);
      return matchMsg || matchType;
    }
    return true;
  });

  if (filtered.length === 0) {
    output.innerHTML = `<div class="p-4 text-center text-slate-600">No logs found matching current filter.</div>`;
    return;
  }

  const fragment = document.createDocumentFragment();
  filtered.forEach(entry => {
    fragment.appendChild(createDevLogRow(entry));
  });
  output.appendChild(fragment);

  const autoScroll = document.getElementById("devAutoScrollToggle");
  if (autoScroll && autoScroll.checked) {
    output.scrollTop = output.scrollHeight;
  }
}

// Fetch backend server logs
async function fetchServerDevLogs() {
  try {
    const res = await window.fetch("/api/dev/logs?limit=150");
    if (!res.ok) {
      const statusEl = document.getElementById("devBackendStatus");
      if (statusEl) {
        statusEl.innerText = "Error (" + res.status + ")";
        statusEl.className = "text-red-400 font-semibold";
      }
      return;
    }

    const data = await res.json();
    const statusEl = document.getElementById("devBackendStatus");
    if (statusEl) {
      statusEl.innerText = "Online";
      statusEl.className = "text-emerald-400 font-semibold";
    }

    if (data.recent_jobs) {
      recentDevJobs = data.recent_jobs;
      updateDevCounts();
      if (currentDevFilter === "jobs") renderDevJobsPanel();
    }

    // Merge new server logs into devLogStore
    if (data.logs && data.logs.length > 0) {
      let addedAny = false;
      data.logs.forEach(slog => {
        const exists = devLogStore.some(e => e.id === slog.id);
        if (!exists) {
          const entry = {
            id: slog.id,
            time: slog.timestamp,
            timestamp: slog.epoch * 1000,
            type: slog.category.toLowerCase() === "http" ? "network" : "server",
            level: slog.level.toLowerCase(),
            message: slog.message,
            details: slog.meta
          };
          devLogStore.push(entry);
          addedAny = true;
          if (entry.level === "error") devErrorCount++;
        }
      });

      if (addedAny) {
        devLogStore.sort((a, b) => a.timestamp - b.timestamp);
        updateDevCounts();
        if (isDevConsoleOpen && currentDevFilter !== "jobs") {
          renderDevLogs();
        }
      }
    }
  } catch (err) {
    const statusEl = document.getElementById("devBackendStatus");
    if (statusEl) {
      statusEl.innerText = "Offline";
      statusEl.className = "text-red-500 font-semibold";
    }
  }
}

// Render Jobs Diagnostics panel
function renderDevJobsPanel() {
  const panel = document.getElementById("devJobsOutput");
  if (!panel) return;

  if (!recentDevJobs || recentDevJobs.length === 0) {
    panel.innerHTML = `<div class="p-6 text-center text-slate-500">No jobs found in server storage.</div>`;
    return;
  }

  let html = `
    <div class="mb-4 flex items-center justify-between">
      <h4 class="font-bold text-white text-sm">Server Job History (${recentDevJobs.length})</h4>
      <p class="text-[11px] text-slate-400">Click any job below to inspect its logs or load finished results directly.</p>
    </div>
    <div class="border border-slate-800 rounded-xl overflow-hidden bg-slate-900/60 divide-y divide-slate-800">
  `;

  recentDevJobs.forEach(j => {
    let statusBadge = "bg-yellow-500/10 text-yellow-400 border border-yellow-500/30";
    if (j.status === "completed") statusBadge = "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30";
    else if (j.status === "failed") statusBadge = "bg-red-500/10 text-red-400 border border-red-500/30";

    html += `
      <div class="p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 hover:bg-slate-800/40 transition">
        <div class="space-y-1">
          <div class="flex items-center space-x-2">
            <span class="font-bold text-white">${escapeHtml(j.topic)}</span>
            <span class="px-2 py-0.5 rounded text-[10px] font-semibold ${statusBadge}">${j.status.toUpperCase()} (${j.progress}%)</span>
            <span class="text-slate-500 text-[10px]">${j.format || "unknown"}</span>
          </div>
          <p class="text-[11px] text-slate-400">${escapeHtml(j.current_stage || "No stage message")}</p>
          <p class="text-[10px] text-slate-500 font-mono">Job ID: <span class="text-slate-300">${j.job_id}</span></p>
        </div>

        <div class="flex items-center space-x-2 flex-shrink-0">
          <button onclick="loadJobDirectly('${j.job_id}')" class="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition">
            Load Results
          </button>
          <button onclick="inspectJobLogs('${j.job_id}')" class="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs border border-slate-700 transition">
            Inspect Logs
          </button>
        </div>
      </div>
    `;
  });

  html += `</div>`;
  panel.innerHTML = html;
}

// Inspect a job's specific logs
async function inspectJobLogs(jobId) {
  try {
    const res = await window.fetch(`/api/jobs/${jobId}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const job = await res.json();
    if (job.logs && job.logs.length > 0) {
      job.logs.forEach(l => {
        pushDevLog("worker", "info", `[${jobId}] ${l}`);
      });
      setDevLogFilter("server");
    } else {
      alert(`No logs stored for job ${jobId}`);
    }
  } catch (e) {
    alert(`Could not fetch logs for ${jobId}: ${e.message}`);
  }
}

// Load a past job directly into results
async function loadJobDirectly(jobId) {
  try {
    const res = await window.fetch(`/api/jobs/${jobId}`);
    if (!res.ok) throw new Error(`Job ${jobId} not found`);
    const job = await res.json();
    currentJobId = job.job_id;
    currentJobResult = job;

    if (job.status === "completed" && job.result) {
      showView("viewResults");
      renderResults(job);
      closeDevConsole();
    } else {
      showView("viewProgress");
      startPollingJob(job.job_id);
      closeDevConsole();
    }
  } catch (err) {
    alert(`Failed to load job: ${err.message}`);
  }
}

// Copy all logs to clipboard
function copyAllDevLogs() {
  const text = devLogStore.map(e => `[${e.time}] [${e.type.toUpperCase()}] [${e.level.toUpperCase()}] ${e.message}`).join("\n");
  navigator.clipboard.writeText(text).then(() => {
    alert(`Copied ${devLogStore.length} log lines to clipboard!`);
  }).catch(() => {
    prompt("Copy logs manually:", text);
  });
}

// Clear logs
async function clearAllDevLogs() {
  devLogStore.length = 0;
  devErrorCount = 0;
  const badge = document.getElementById("devErrorCounterBadge");
  if (badge) badge.classList.add("hidden");
  const dot = document.getElementById("devConsoleDot");
  if (dot) {
    dot.classList.remove("bg-red-500");
    dot.classList.add("bg-emerald-400");
  }

  try {
    await window.fetch("/api/dev/logs/clear", { method: "POST" });
  } catch (e) {}

  renderDevLogs();
  updateDevCounts();
}


