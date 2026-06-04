const BIN_IMAGES = {
  recyclable: "/static/bins/recyclable.png",
  organic: "/static/bins/organic.png",
  general: "/static/bins/general.png",
  hazardous: "/static/bins/hazardous.png",
  ewaste: "/static/bins/ewaste.png",
};

const COLOR_TO_BIN = {
  blue: "recyclable",
  green: "organic",
  black: "general",
  red: "hazardous",
  orange: "ewaste",
};

const BIN_THEME = {
  blue: { color: "#3b82f6", binId: "recyclable", label: "blue bin" },
  green: { color: "#22c55e", binId: "organic", label: "green bin" },
  black: { color: "#64748b", binId: "general", label: "black bin" },
  red: { color: "#ef4444", binId: "hazardous", label: "red bin" },
  orange: { color: "#f97316", binId: "ewaste", label: "orange bin" },
};

const CONFIDENCE_PCT = { high: 92, medium: 68, low: 42 };
const RESET_SECONDS = 30;

const HERO_JOKES = [
  "Got weird trash? We've got weird bins.",
  "Stop playing bin roulette — let AI pick for you.",
  "Every wrapper has a destiny. Usually a coloured lid.",
  "Landfill is the last resort. Let's not send it there by accident.",
  "Type your junk. We'll tell it where to crash.",
];

const IDLE_JOKES = [
  "Type something above and hit Sort. We don't bite.",
  "Confused about a greasy pizza box? We've been there.",
  "Your ex's gifts? Probably general waste. Just saying.",
  "Banana peels are compost heroes. Be like banana peels.",
];

const LOADING_JOKES = [
  "Asking the bins their opinion…",
  "Sniffing your trash digitally…",
  "Bribing the recycling fairy…",
  "Consulting the landfill oracle…",
];

const CAMERA_LOADING_JOKES = [
  "Studying your trash with AI eyes…",
  "Zooming in on that wrapper…",
  "Teaching the bins to see…",
];

const HUMOR_VERDICT_LINES = [
  "The bins have spoken. It's a no.",
  "Certified: not trash.",
  "Landfill says hard pass.",
  "Recycling stream unavailable for this one.",
];

const BIN_JOKES = {
  recyclable: "The planet just whispered “thanks.”",
  organic: "Let it rot in style — nature approves.",
  general: "Landfill awaits. Not glamorous, but honest.",
  hazardous: "Handle with care — this bin has trust issues.",
  ewaste: "Your gadget’s retirement home. Orange bin energy.",
};

const $ = (sel) => document.querySelector(sel);

const els = {
  html: document.documentElement,
  status: $("#status"),
  themeToggle: $("#theme-toggle"),
  btnSpeakToggle: $("#btn-speak-toggle"),
  btnHearAgain: $("#btn-hear-again"),
  heroJoke: $("#hero-joke"),
  idleHint: $("#idle-hint"),
  form: $("#search-form"),
  input: $("#item-input"),
  btnCamera: $("#btn-camera"),
  btnVoice: $("#btn-voice"),
  photoInput: $("#photo-input"),
  cameraModal: $("#camera-modal"),
  cameraVideo: $("#camera-video"),
  cameraCanvas: $("#camera-canvas"),
  cameraPreviewImg: $("#camera-preview-img"),
  btnCapture: $("#btn-capture"),
  btnUploadPhoto: $("#btn-upload-photo"),
  btnRetake: $("#btn-retake"),
  voiceHint: $("#voice-hint"),
  btn: $("#btn-sort"),
  error: $("#error"),
  resultsBox: $("#results-box"),
  loadingMsg: $("#loading-msg"),
  btnAgain: $("#btn-sort-again"),
  resetCountdown: $("#reset-countdown"),
  examples: $("#examples"),
  binList: $("#bin-list"),
  verdictBanner: $("#verdict-banner"),
  binStrip: $("#bin-strip"),
  idleBinIcons: $("#idle-bin-icons"),
  verdictDustbin: $("#verdict-dustbin"),
  verdictLabel: document.querySelector(".verdict__label"),
  verdictJoke: $("#verdict-joke"),
  verdictColorTag: $("#verdict-color-tag"),
  itemValue: $("#result-item"),
  binName: $("#result-bin-name"),
  badges: $("#result-badges"),
  traitCompostable: $("#trait-compostable"),
  traitDecomposable: $("#trait-decomposable"),
  confidenceLabel: $("#confidence-label"),
  confidencePct: $("#confidence-pct"),
  reason: $("#result-reason"),
  tip: $("#result-tip"),
};

let resetTimer = null;
let resetInterval = null;
let recognition = null;
let voiceListening = false;
let voiceAutoSort = false;
let voiceSessionRequested = false;
let speakEnabled = localStorage.getItem("binboss-speak") !== "false";
let lastSpokenResult = null;
let speechVoices = [];
let speakDelayTimer = null;
let preferredLadyVoice = null;
let loadingTick = null;
let visionAvailable = false;
let cameraStream = null;
let cameraCapturedBlob = null;

function themeForColor(name) {
  const key = (name || "blue").toLowerCase();
  return BIN_THEME[key] || BIN_THEME.blue;
}

function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

function resolveBinId(binKey) {
  if (BIN_IMAGES[binKey]) return binKey;
  return COLOR_TO_BIN[(binKey || "").toLowerCase()] || "recyclable";
}

function dustbinHtml(binKey, size = "sm") {
  const id = resolveBinId(binKey);
  const src = BIN_IMAGES[id];
  return `<img class="bin-img bin-img--${size}" src="${src}" alt="" loading="lazy" decoding="async" />`;
}

const STRIP_LABELS = {
  recyclable: "Recycle",
  organic: "Organic",
  general: "General",
  hazardous: "Hazard",
  ewaste: "E-waste",
};

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function initTheme() {
  const saved = localStorage.getItem("binboss-theme");
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const theme = saved === "light" || saved === "dark" ? saved : "light";
  applyTheme(theme);
}

function applyTheme(theme) {
  els.html.setAttribute("data-theme", theme);
  localStorage.setItem("binboss-theme", theme);
  if (els.themeToggle) {
    els.themeToggle.setAttribute("aria-pressed", theme === "dark" ? "true" : "false");
    els.themeToggle.setAttribute(
      "aria-label",
      theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
    );
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "dark" ? "#0a0a0a" : "#0f766e");
  if (window.BinBossLiveBg) window.BinBossLiveBg.setTheme(theme);
}

function toggleTheme() {
  const next = els.html.getAttribute("data-theme") === "dark" ? "light" : "dark";
  applyTheme(next);
}

function setStatus(ok, message) {
  els.status.className = `pill ${ok ? "ok" : "error"}`;
  els.status.querySelector(".status-text").textContent = message;
}

async function checkHealth() {
  try {
    const res = await fetch("/api/health");
    const data = await res.json();
    visionAvailable = !!(data.ok && data.vision);
    if (data.ok) {
      const parts = ["Ollama ready"];
      if (data.vision) parts.push("camera on");
      else parts.push("camera needs moondream");
      setStatus(true, parts.join(" · "));
    } else {
      setStatus(false, data.error || "AI offline");
    }
    if (els.btnCamera) {
      els.btnCamera.disabled = !visionAvailable;
      els.btnCamera.title = visionAvailable
        ? "Scan with camera"
        : "Install vision: ollama pull moondream";
    }
  } catch {
    visionAvailable = false;
    setStatus(false, "Server offline");
    if (els.btnCamera) els.btnCamera.disabled = true;
  }
}

async function loadBins() {
  const res = await fetch("/api/bins");
  const bins = await res.json();

  els.binStrip.innerHTML = bins
    .map((b) => {
      const t = themeForColor(b.color);
      const short = STRIP_LABELS[b.id] || b.name.split("/")[0].trim();
      return `<div class="bin-strip__item">
        ${dustbinHtml(b.id, "md")}
        <span class="bin-strip__label">${escapeHtml(short)}</span>
      </div>`;
    })
    .join("");

  if (els.idleBinIcons) {
    els.idleBinIcons.innerHTML = bins.map((b) => dustbinHtml(b.id, "sm")).join("");
  }

  els.binList.innerHTML = bins
    .map((b) => {
      const t = themeForColor(b.color);
      return `
      <div class="bin-item" data-bin-id="${b.id}" style="--bin-color: ${t.color}">
        ${dustbinHtml(b.id, "sm")}
        <span class="bin-item__name">${escapeHtml(b.name)}</span>
      </div>`;
    })
    .join("");
}

function showError(msg) {
  els.error.textContent = msg;
  els.error.classList.add("visible");
}

function hideError() {
  els.error.classList.remove("visible");
}

function clearBinHighlight() {
  document.querySelectorAll(".bin-item").forEach((el) => {
    el.classList.remove("active");
  });
}

function highlightBin(binId) {
  clearBinHighlight();
  if (!binId) return;
  const match = document.querySelector(`.bin-item[data-bin-id="${binId}"]`);
  if (match) match.classList.add("active");
}

function setResultsState(state) {
  els.resultsBox.className = `card results state-${state}`;
}

function clearResetTimer() {
  if (resetTimer) clearTimeout(resetTimer);
  if (resetInterval) clearInterval(resetInterval);
  resetTimer = null;
  resetInterval = null;
  els.resetCountdown.textContent = "";
}

function scheduleAutoReset() {
  clearResetTimer();
  let left = RESET_SECONDS;
  els.resetCountdown.textContent = `Clears in ${left}s — or tap “Sort another item”`;

  resetInterval = setInterval(() => {
    left -= 1;
    if (left > 0) {
      els.resetCountdown.textContent = `Clears in ${left}s — or tap “Sort another item”`;
    }
  }, 1000);

  resetTimer = setTimeout(() => resetToStart(), RESET_SECONDS * 1000);
}

function setHeroJoke() {
  els.heroJoke.textContent = pickRandom(HERO_JOKES);
}

function resetToStart() {
  stopSpeech();
  if (els.btnHearAgain) els.btnHearAgain.hidden = true;
  lastSpokenResult = null;
  clearResetTimer();
  clearBinHighlight();
  setResultsState("idle");
  els.idleHint.textContent = pickRandom(IDLE_JOKES);
  setHeroJoke();
  els.input.focus();
}

function setTraitValue(el, yes) {
  el.textContent = yes ? "Yes" : "No";
  el.className = `trait-card__value ${yes ? "trait-card__value--yes" : "trait-card__value--no"}`;
}

function scrollToResults() {
  if (!window.matchMedia("(max-width: 768px)").matches || !els.resultsBox) return;
  requestAnimationFrame(() => {
    els.resultsBox.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function speechSupported() {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

function stopSpeech() {
  if (speakDelayTimer) {
    clearTimeout(speakDelayTimer);
    speakDelayTimer = null;
  }
  if (!speechSupported()) return;
  window.speechSynthesis.cancel();
}

const POLITE_BIN = {
  recyclable: {
    plain: [
      "That belongs in the blue recycling bin, please.",
      "I'd gently suggest the blue bin for recycling.",
      "Please pop that in the blue recycling bin. Thank you.",
    ],
    withItem: [
      "For {item}, the blue recycling bin would be just right, please.",
      "I'd place {item} in the blue bin, if you don't mind.",
      "{item} is perfect for the blue recycling bin, please.",
    ],
  },
  organic: {
    plain: [
      "Please use the green compost bin for that.",
      "I'd pop that in the green organic bin, gently.",
      "The green bin is best for compost, please.",
    ],
    withItem: [
      "For {item}, the green compost bin is lovely, please.",
      "{item} belongs in the green organic bin, thank you.",
      "I'd tuck {item} into the green bin, if that's alright.",
    ],
  },
  general: {
    plain: [
      "Please use the black general waste bin for that.",
      "I'd suggest the black bin for general rubbish, please.",
      "That goes in the black bin, thank you.",
    ],
    withItem: [
      "For {item}, the black general waste bin, please.",
      "{item} can go in the black bin, if you don't mind.",
      "I'd place {item} in the black bin, gently.",
    ],
  },
  hazardous: {
    plain: [
      "Please be careful. That needs the red hazardous bin.",
      "I'd use the special red bin for that, please. Handle with care.",
      "Kindly place that in the red hazardous bin only.",
    ],
    withItem: [
      "For {item}, please use the red hazardous bin only.",
      "{item} should go in the red bin, carefully, please.",
      "I'd put {item} in the red hazardous bin, with care.",
    ],
  },
  ewaste: {
    plain: [
      "Please use the orange e-waste bin for electronics.",
      "I'd suggest the orange bin for gadgets and batteries, please.",
      "The orange bin is right for electronic waste, thank you.",
    ],
    withItem: [
      "For {item}, the orange e-waste bin, please.",
      "{item} belongs in the orange electronics bin, gently.",
      "I'd place {item} in the orange bin, if you don't mind.",
    ],
  },
};

const SPEAK_NOT_TRASH = [
  "I'm sorry, that doesn't seem to be waste. No bin needed, dear.",
  "Gently speaking, that's not something for the bins, please.",
  "I wouldn't sort that as trash. Perhaps try a real item?",
  "That's not quite waste, love. The bins aren't sure what to do.",
];

function pickKarenVoice() {
  if (preferredLadyVoice) return preferredLadyVoice;
  if (!speechVoices.length) speechVoices = window.speechSynthesis.getVoices();
  const karen = speechVoices.find((v) => v.name.toLowerCase().includes("karen"));
  preferredLadyVoice = karen || null;
  return preferredLadyVoice;
}

function speakableItem(item) {
  const s = (item || "").trim().replace(/\s+/g, " ");
  if (!s || s.length > 36) return null;
  return s;
}

function politeBinLine(binId, item) {
  const pack = POLITE_BIN[binId] || POLITE_BIN.general;
  if (item) {
    const tpl = pickRandom(pack.withItem);
    return tpl.replace(/\{item\}/g, item);
  }
  return pickRandom(pack.plain);
}

function buildSpeakLines(data) {
  if (data.humorous) {
    return [pickRandom(SPEAK_NOT_TRASH)];
  }
  const item = speakableItem(data.item);
  return [politeBinLine(data.bin_id || "general", item)];
}

function speakQueue(lines) {
  if (!lines.length) return;
  const voice = pickKarenVoice();
  let index = 0;

  const speakNext = () => {
    if (index >= lines.length) return;
    const line = lines[index];
    index += 1;
    const utter = new SpeechSynthesisUtterance(line);
    utter.rate = 0.68;
    utter.pitch = 1.04;
    utter.volume = 0.92;
    if (voice) utter.voice = voice;
    utter.onend = () => {
      if (index < lines.length) {
        window.setTimeout(speakNext, 520);
      }
    };
    window.speechSynthesis.speak(utter);
  };

  speakNext();
}

function updateSpeakToggleUi() {
  if (!els.btnSpeakToggle) return;
  els.btnSpeakToggle.setAttribute("aria-pressed", speakEnabled ? "true" : "false");
  els.btnSpeakToggle.setAttribute(
    "aria-label",
    speakEnabled ? "Turn off gentle voice assistant" : "Turn on gentle voice assistant"
  );
  els.btnSpeakToggle.title = speakEnabled
    ? "Soft voice assistant on"
    : "Soft voice assistant off";
  els.btnSpeakToggle.classList.toggle("is-off", !speakEnabled);
}

function speakVerdict(data) {
  if (!speechSupported() || !speakEnabled || !data) return;
  lastSpokenResult = data;
  stopSpeech();
  const lines = buildSpeakLines(data);
  speakDelayTimer = window.setTimeout(() => {
    speakDelayTimer = null;
    speakQueue(lines);
  }, 150);
  if (els.btnHearAgain) {
    els.btnHearAgain.hidden = false;
  }
}

function initSpeech() {
  if (!speechSupported()) {
    speakEnabled = false;
    if (els.btnSpeakToggle) els.btnSpeakToggle.hidden = true;
    updateSpeakToggleUi();
    return;
  }
  const loadVoices = () => {
    speechVoices = window.speechSynthesis.getVoices();
    preferredLadyVoice = null;
    pickKarenVoice();
  };
  loadVoices();
  window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
  updateSpeakToggleUi();
}

function announceResult(data) {
  speakVerdict(data);
}

function renderHumorous(data) {
  if (els.verdictLabel) els.verdictLabel.textContent = "Verdict";
  els.verdictBanner.classList.add("verdict--humor");
  els.verdictBanner.style.setProperty("--verdict-color", "#94a3b8");
  els.verdictDustbin.innerHTML = '<span class="verdict__emoji" aria-hidden="true">😅</span>';
  els.binName.textContent = data.title || "Nice try";
  els.verdictJoke.textContent = pickRandom(HUMOR_VERDICT_LINES);
  els.verdictColorTag.textContent = "No bin assigned";
  els.itemValue.textContent = data.item;

  els.badges.innerHTML = `
    <span class="badge badge-no">🚫 Not sortable waste</span>
    <span class="badge badge-no">✕ Not recyclable</span>
    <span class="badge badge-no">✕ Not compostable</span>
  `;

  els.traitCompostable.textContent = "—";
  els.traitCompostable.className = "trait-card__value";
  els.traitDecomposable.textContent = "—";
  els.traitDecomposable.className = "trait-card__value";
  els.confidenceLabel.textContent = "N/A";
  els.confidencePct.textContent = "—";
  els.reason.textContent = data.reason || "—";
  els.tip.textContent = data.tip || "—";

  clearBinHighlight();
  setResultsState("result");
  scheduleAutoReset();
  scrollToResults();
  announceResult(data);
}

function renderResult(data) {
  if (els.verdictLabel) els.verdictLabel.textContent = "Put it in";
  els.verdictBanner.classList.remove("verdict--humor");
  const t = themeForColor(data.bin_color);
  const pct = CONFIDENCE_PCT[data.confidence?.toLowerCase()] ?? 70;
  const joke = BIN_JOKES[data.bin_id] || "BinBoss has spoken.";

  els.verdictBanner.style.setProperty("--verdict-color", t.color);
  els.verdictDustbin.innerHTML = dustbinHtml(data.bin_id, "lg");
  els.binName.textContent = data.bin_name;
  els.verdictJoke.textContent = joke;
  els.verdictColorTag.textContent = t.label.replace(/\b\w/g, (c) => c.toUpperCase());
  els.itemValue.textContent = data.item;

  els.badges.innerHTML = `
    <span class="badge badge-bin" style="--badge-color:${t.color}">${escapeHtml(t.label)}</span>
    <span class="badge ${data.recyclable ? "badge-yes" : "badge-no"}">
      ${data.recyclable ? "♻ Recyclable" : "✕ Not recyclable"}
    </span>
    <span class="badge ${data.compostable ? "badge-yes" : "badge-no"}">
      ${data.compostable ? "🌱 Compostable" : "✕ Not compostable"}
    </span>
    <span class="badge ${data.decomposable ? "badge-yes" : "badge-no"}">
      ${data.decomposable ? "⏳ Decomposable" : "✕ Not decomposable"}
    </span>
  `;

  setTraitValue(els.traitCompostable, !!data.compostable);
  setTraitValue(els.traitDecomposable, !!data.decomposable);

  els.confidenceLabel.textContent = data.confidence;
  els.confidencePct.textContent = pct;
  els.reason.textContent = data.reason || "—";
  els.tip.textContent = data.tip || "—";

  highlightBin(data.bin_id);
  setResultsState("result");
  scheduleAutoReset();
  scrollToResults();
  announceResult(data);
}

function startLoadingProgress(isCamera = false) {
  stopLoadingProgress();
  const jokes = isCamera ? CAMERA_LOADING_JOKES : LOADING_JOKES;
  const start = Date.now();
  els.loadingMsg.textContent = pickRandom(jokes);
  loadingTick = setInterval(() => {
    const sec = Math.floor((Date.now() - start) / 1000);
    if (sec >= 3) {
      els.loadingMsg.textContent =
        sec < 8
          ? `Sorting… ${sec}s`
          : `Still working… ${sec}s (first sort after startup is slowest)`;
    }
  }, 1000);
}

function stopLoadingProgress() {
  if (loadingTick) {
    clearInterval(loadingTick);
    loadingTick = null;
  }
}

async function resizeImageForUpload(blob, maxDim = 768) {
  if (!(blob instanceof Blob)) return blob;
  try {
    const bitmap = await createImageBitmap(blob);
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d").drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    return await new Promise((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("resize failed"))), "image/jpeg", 0.82);
    });
  } catch {
    return blob;
  }
}

async function classify(item) {
  stopVoice();
  stopSpeech();
  hideError();
  clearResetTimer();
  clearBinHighlight();
  startLoadingProgress(false);
  setResultsState("loading");
  scrollToResults();
  els.btn.disabled = true;

  try {
    const res = await fetch("/api/classify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.detail || "Classification failed");
    if (body.humorous) renderHumorous(body);
    else renderResult(body);
  } catch (err) {
    resetToStart();
    showError(err.message);
  } finally {
    stopLoadingProgress();
    els.btn.disabled = false;
  }
}

async function classifyImage(blob) {
  stopVoice();
  stopSpeech();
  closeCameraModal();
  hideError();
  clearResetTimer();
  clearBinHighlight();
  startLoadingProgress(true);
  setResultsState("loading");
  scrollToResults();
  els.btn.disabled = true;
  if (els.btnCamera) els.btnCamera.disabled = true;

  const upload = await resizeImageForUpload(blob);
  const form = new FormData();
  form.append("file", upload, "capture.jpg");

  try {
    const res = await fetch("/api/classify-image", { method: "POST", body: form });
    const body = await res.json();
    if (!res.ok) {
      const detail = typeof body.detail === "string" ? body.detail : "Image classification failed";
      throw new Error(detail);
    }
    if (body.item) els.input.value = body.item;
    if (body.humorous) renderHumorous(body);
    else renderResult(body);
  } catch (err) {
    resetToStart();
    showError(err.message);
  } finally {
    stopLoadingProgress();
    els.btn.disabled = false;
    if (els.btnCamera) els.btnCamera.disabled = !visionAvailable;
  }
}

function initExamples() {
  const samples = [
    "paper",
    "plastic bottle",
    "banana peel",
    "AA battery",
    "pizza box",
    "knife",
  ];
  els.examples.innerHTML =
    '<span class="examples-label">Try:</span>' +
    samples
      .map((s) => `<button type="button" class="chip" data-item="${escapeHtml(s)}">${escapeHtml(s)}</button>`)
      .join("");

  els.examples.addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    els.input.value = chip.dataset.item;
    classify(chip.dataset.item);
  });
}

els.form.addEventListener("submit", (e) => {
  e.preventDefault();
  stopVoice();
  const item = els.input.value.trim();
  if (!item) return;
  classify(item);
});

els.btnAgain.addEventListener("click", resetToStart);

els.themeToggle.addEventListener("click", toggleTheme);

if (els.btnSpeakToggle) {
  els.btnSpeakToggle.addEventListener("click", () => {
    speakEnabled = !speakEnabled;
    localStorage.setItem("binboss-speak", speakEnabled ? "true" : "false");
    updateSpeakToggleUi();
    if (!speakEnabled) stopSpeech();
    else if (lastSpokenResult) speakVerdict(lastSpokenResult);
  });
}

if (els.btnHearAgain) {
  els.btnHearAgain.addEventListener("click", () => {
    if (lastSpokenResult) speakVerdict(lastSpokenResult);
  });
}

function getSpeechRecognition() {
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function setVoiceHint(text, visible = true) {
  if (!text) {
    els.voiceHint.hidden = true;
    els.voiceHint.textContent = "";
    return;
  }
  els.voiceHint.hidden = !visible;
  els.voiceHint.textContent = text;
}

function setVoiceListening(on) {
  voiceListening = on;
  els.btnVoice.classList.toggle("is-listening", on);
  els.btnVoice.setAttribute("aria-pressed", on ? "true" : "false");
  if (on) {
    setVoiceHint("Listening… say your item (e.g. “plastic bottle”)", true);
  } else if (!els.voiceHint.classList.contains("voice-hint--error")) {
    setVoiceHint("", false);
  }
}

function stopRecognitionEngine(force = false) {
  if (!recognition) return;
  try {
    recognition.stop();
  } catch {}
  if (force) {
    try {
      recognition.abort();
    } catch {}
  }
}

function endVoiceListening() {
  voiceSessionRequested = false;
  setVoiceListening(false);
}

function stopVoice(clearAutoSort = true) {
  if (clearAutoSort) voiceAutoSort = false;
  stopRecognitionEngine(true);
  endVoiceListening();
}

function startVoice() {
  const SpeechRecognition = getSpeechRecognition();
  if (!SpeechRecognition) {
    showError("Voice input is not supported in this browser. Try Chrome or Safari.");
    return;
  }

  if (voiceListening) {
    stopVoice();
    return;
  }

  hideError();
  if (!recognition) {
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = navigator.language || "en-US";
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      if (!voiceSessionRequested) return;
      setVoiceListening(true);
    };

    recognition.onend = () => {
      endVoiceListening();
    };

    recognition.onresult = (event) => {
      let interim = "";
      let finalText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalText += transcript;
        } else {
          interim += transcript;
        }
      }
      const text = (finalText || interim).trim();
      if (text) {
        els.input.value = text;
        if (finalText) {
          const heard = finalText.trim();
          els.input.value = heard;
          setVoiceHint(`Heard: “${heard}”`, true);
          voiceAutoSort = false;
          stopRecognitionEngine(false);
          endVoiceListening();
          classify(heard);
        } else {
          setVoiceHint(`Hearing: ${interim.trim()}…`, true);
        }
      }
    };

    recognition.onerror = (event) => {
      voiceAutoSort = false;
      stopRecognitionEngine(true);
      endVoiceListening();
      els.voiceHint.classList.add("voice-hint--error");
      const messages = {
        "not-allowed": "Microphone blocked — allow mic access in browser settings.",
        "no-speech": "Didn't catch that. Tap the mic and try again.",
        "network": "Voice needs internet in some browsers.",
        aborted: "",
      };
      const msg = messages[event.error] || `Voice error: ${event.error}`;
      if (msg) {
        setVoiceHint(msg, true);
        showError(msg);
      }
      setTimeout(() => els.voiceHint.classList.remove("voice-hint--error"), 4000);
    };
  }

  voiceAutoSort = false;
  voiceSessionRequested = true;
  try {
    recognition.start();
  } catch {
    voiceSessionRequested = false;
    showError("Could not start microphone. Try again.");
  }
}

function initVoice() {
  const SpeechRecognition = getSpeechRecognition();
  if (!SpeechRecognition) {
    els.btnVoice.disabled = true;
    els.btnVoice.title = "Voice not supported — use Chrome, Edge, or Safari";
    return;
  }
  els.btnVoice.addEventListener("click", startVoice);
}

function stopCameraStream() {
  if (cameraStream) {
    cameraStream.getTracks().forEach((t) => t.stop());
    cameraStream = null;
  }
  if (els.cameraVideo) els.cameraVideo.srcObject = null;
}

function setCameraPreviewMode(mode) {
  const live = mode === "live";
  if (els.cameraVideo) els.cameraVideo.hidden = !live;
  if (els.cameraPreviewImg) els.cameraPreviewImg.hidden = live;
  if (els.btnRetake) els.btnRetake.hidden = live;
  if (els.btnCapture) els.btnCapture.hidden = !live;
}

function closeCameraModal() {
  if (!els.cameraModal) return;
  stopCameraStream();
  cameraCapturedBlob = null;
  els.cameraModal.hidden = true;
  els.cameraModal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("camera-open");
}

async function openCameraModal() {
  if (!visionAvailable) {
    showError("Camera needs a vision model. Set GEMINI_API_KEY or run: ollama pull moondream");
    return;
  }
  hideError();
  setCameraPreviewMode("live");
  if (els.cameraPreviewImg) els.cameraPreviewImg.removeAttribute("src");
  els.cameraModal.hidden = false;
  els.cameraModal.setAttribute("aria-hidden", "false");
  document.body.classList.add("camera-open");

  if (!navigator.mediaDevices?.getUserMedia) {
    closeCameraModal();
    els.photoInput?.click();
    return;
  }

  try {
    stopCameraStream();
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } },
      audio: false,
    });
    els.cameraVideo.srcObject = cameraStream;
    await els.cameraVideo.play();
  } catch {
    closeCameraModal();
    showError("Camera blocked or unavailable — use Upload photo instead.");
    els.photoInput?.click();
  }
}

function captureFromVideo() {
  const video = els.cameraVideo;
  const canvas = els.cameraCanvas;
  if (!video?.videoWidth) return null;
  const maxDim = 768;
  const scale = Math.min(1, maxDim / Math.max(video.videoWidth, video.videoHeight));
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
  canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.82);
  });
}

async function onCaptureClick() {
  const blob = await captureFromVideo();
  if (!blob) {
    showError("Could not capture — try again or upload a photo.");
    return;
  }
  cameraCapturedBlob = blob;
  const url = URL.createObjectURL(blob);
  els.cameraPreviewImg.src = url;
  setCameraPreviewMode("still");
  stopCameraStream();
  await classifyImage(blob);
  URL.revokeObjectURL(url);
}

function onPhotoFileSelected(file) {
  if (!file || !file.type.startsWith("image/")) {
    showError("Please choose an image file.");
    return;
  }
  if (els.cameraPreviewImg) {
    const url = URL.createObjectURL(file);
    els.cameraPreviewImg.src = url;
    setCameraPreviewMode("still");
    URL.revokeObjectURL(url);
  }
  classifyImage(file);
}

function initCamera() {
  if (!els.btnCamera) return;

  els.btnCamera.addEventListener("click", () => {
    stopVoice();
    openCameraModal();
  });

  els.btnCapture?.addEventListener("click", onCaptureClick);

  els.btnUploadPhoto?.addEventListener("click", () => {
    els.photoInput?.click();
  });

  els.btnRetake?.addEventListener("click", () => {
    cameraCapturedBlob = null;
    openCameraModal();
  });

  els.photoInput?.addEventListener("change", () => {
    const file = els.photoInput.files?.[0];
    els.photoInput.value = "";
    if (file) onPhotoFileSelected(file);
  });

  document.querySelectorAll("[data-close-camera]").forEach((el) => {
    el.addEventListener("click", closeCameraModal);
  });
}

initVoice();
initCamera();
initSpeech();

initTheme();
setHeroJoke();
els.idleHint.textContent = pickRandom(IDLE_JOKES);
initExamples();
loadBins();
checkHealth();
resetToStart();
