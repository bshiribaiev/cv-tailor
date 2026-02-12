/** Content script auto-injected on job sites — edge tab that auto-expands on complete */

import { extractJobDescription } from "./extractor";

// Internal state
let currentState: "idle" | "extracting" | "tailoring" | "done" | "error" = "idle";
let currentStage = "";
let currentPct = 0;
let currentPayload: { pdfBase64?: string; texBase64?: string; filename: string } | null = null;
let currentError = "";
let hasResume = false;
let hasApiKey = false;

function init() {
  if (document.getElementById("cv-tailor-fab")) return;

  const root = document.createElement("div");
  root.id = "cv-tailor-fab";
  root.innerHTML = `
    <div id="cv-tailor-root" style="
      position: fixed;
      bottom: 80px;
      right: 0;
      z-index: 2147483647;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    ">
      <div id="cv-tailor-tab" style="
        background: #2563eb;
        color: white;
        border-radius: 8px 0 0 8px;
        padding: 10px 8px;
        cursor: pointer;
        box-shadow: -2px 2px 8px rgba(0,0,0,0.15);
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
        font-size: 16px;
        width: 36px;
        height: 36px;
      " title="Tailor Resume">&#9998;</div>
      <div id="cv-tailor-panel" style="
        display: none;
        position: absolute;
        bottom: 0;
        right: 12px;
        background: white;
        border-radius: 12px;
        box-shadow: 0 4px 24px rgba(0,0,0,0.18);
        width: 300px;
        font-size: 13px;
        color: #333;
        overflow: hidden;
      ">
        <div style="
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 10px 14px;
          border-bottom: 1px solid #e5e7eb;
        ">
          <span style="font-weight: 700; font-size: 14px;">CV Tailor</span>
          <div style="display:flex;align-items:center;gap:6px;">
            <button id="cv-tailor-settings" style="
              background: none; border: none; cursor: pointer;
              color: #9ca3af; font-size: 14px; padding: 2px;
            " title="Settings">&#9881;</button>
            <button id="cv-tailor-close" style="
              background: none; border: none; cursor: pointer;
              color: #9ca3af; font-size: 16px; padding: 2px; line-height: 1;
            " title="Close">&#10005;</button>
          </div>
        </div>
        <div id="cv-tailor-body" style="padding: 12px 14px;"></div>
      </div>
    </div>
  `;
  document.body.appendChild(root);

  const tab = document.getElementById("cv-tailor-tab")!;
  const panel = document.getElementById("cv-tailor-panel")!;
  const body = document.getElementById("cv-tailor-body")!;
  const settingsBtn = document.getElementById("cv-tailor-settings")!;
  const closeBtn = document.getElementById("cv-tailor-close")!;

  // Hover on tab
  tab.addEventListener("mouseenter", () => { tab.style.background = "#1d4ed8"; });
  tab.addEventListener("mouseleave", () => {
    tab.style.background = currentState === "tailoring" ? "#f59e0b" : "#2563eb";
  });

  // Click tab → expand panel (never auto-start)
  tab.addEventListener("click", () => {
    tab.style.display = "none";
    panel.style.display = "block";
    renderBody();
  });

  // Collapse
  closeBtn.addEventListener("click", () => {
    panel.style.display = "none";
    tab.style.display = "flex";
  });

  // Settings
  settingsBtn.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "OPEN_OPTIONS" });
  });

  function renderBody() {
    if (currentState === "idle") {
      body.innerHTML = `
        <button id="cv-tailor-start" style="
          width:100%;padding:10px;background:#2563eb;color:white;border:none;
          border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;
        ">Tailor Resume</button>
      `;
      document.getElementById("cv-tailor-start")?.addEventListener("click", () => {
        startTailoring();
      });
    } else if (currentState === "extracting" || currentState === "tailoring") {
      body.innerHTML = `
        <p style="margin:0 0 8px 0;font-size:13px;">${currentStage || "Processing..."}</p>
        <div style="background:#e5e7eb;border-radius:4px;height:6px;overflow:hidden;">
          <div id="cv-tailor-progress" style="background:#2563eb;height:100%;width:${currentPct}%;transition:width 0.3s;"></div>
        </div>
        <p id="cv-tailor-pct" style="margin:4px 0 0;font-size:11px;color:#666;">${currentPct}%</p>
      `;
    } else if (currentState === "done" && currentPayload) {
      const isPdf = !!currentPayload.pdfBase64;
      const hint = isPdf ? "" : `<p style="margin:0 0 8px 0;font-size:11px;color:#666;">Compile .tex in Overleaf for PDF</p>`;
      body.innerHTML = `
        <p style="margin:0 0 8px 0;color:#16a34a;font-weight:600;">Resume tailored!</p>
        ${hint}
        <button id="cv-tailor-download" style="
          width:100%;padding:10px;background:#16a34a;color:white;border:none;
          border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;
        ">Download ${isPdf ? "PDF" : ".tex"}</button>
        <button id="cv-tailor-again" style="
          width:100%;padding:8px;background:#e5e7eb;border:none;
          border-radius:8px;cursor:pointer;font-size:12px;margin-top:6px;
        ">Tailor Another</button>
      `;
      document.getElementById("cv-tailor-download")?.addEventListener("click", () => downloadFile(currentPayload!));
      document.getElementById("cv-tailor-again")?.addEventListener("click", () => {
        currentState = "idle";
        currentPayload = null;
        renderBody();
      });
    } else if (currentState === "error") {
      body.innerHTML = `
        <p style="margin:0 0 8px 0;color:#dc2626;font-size:13px;">${currentError}</p>
        <button id="cv-tailor-retry" style="
          width:100%;padding:8px;background:#e5e7eb;border:none;
          border-radius:8px;cursor:pointer;font-size:12px;
        ">Try Again</button>
      `;
      document.getElementById("cv-tailor-retry")?.addEventListener("click", () => {
        currentState = "idle";
        currentError = "";
        panel.style.display = "none";
        tab.style.display = "flex";
        tab.style.background = "#2563eb";
      });
    }
  }

  function startTailoring() {
    currentState = "extracting";
    currentStage = "Extracting job description...";
    currentPct = 5;
    tab.style.background = "#f59e0b";
    renderBody();

    chrome.runtime.sendMessage({ type: "GET_STATUS" }, (res: any) => {
      if (res?.payload) {
        hasResume = res.payload.hasResume;
        hasApiKey = res.payload.hasApiKey;
      }
      if (!hasResume || !hasApiKey) {
        currentState = "error";
        currentError = !hasResume
          ? "No resume uploaded. Open Settings to upload your .tex file."
          : "No API key set. Open Settings to add your Gemini API key.";
        // Expand panel to show error
        tab.style.display = "none";
        tab.style.background = "#2563eb";
        panel.style.display = "block";
        renderBody();
        return;
      }

      const jd = extractJobDescription();
      if (!jd.description || jd.description.length < 50) {
        currentState = "error";
        currentError = "Could not extract job description from this page.";
        tab.style.display = "none";
        tab.style.background = "#2563eb";
        panel.style.display = "block";
        renderBody();
        return;
      }

      currentState = "tailoring";
      currentStage = "Tailoring resume...";
      currentPct = 10;
      renderBody();

      chrome.runtime.sendMessage({
        type: "START_TAILORING",
        payload: { jobDescription: jd.description, jobTitle: jd.title, company: jd.company },
      });
    });
  }

  function downloadFile(payload: { pdfBase64?: string; texBase64?: string; filename: string }) {
    let blob: Blob;
    if (payload.pdfBase64) {
      const bytes = Uint8Array.from(atob(payload.pdfBase64), (c) => c.charCodeAt(0));
      blob = new Blob([bytes], { type: "application/pdf" });
    } else {
      const content = decodeURIComponent(escape(atob(payload.texBase64!)));
      blob = new Blob([content], { type: "text/plain" });
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = payload.filename || "resume.pdf";
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleProgress(stage: string, pct: number) {
    currentState = "tailoring";
    currentStage = stage;
    currentPct = pct;
    tab.style.background = "#f59e0b";
    // Update in-place if panel is open
    const bar = document.getElementById("cv-tailor-progress");
    const pctEl = document.getElementById("cv-tailor-pct");
    if (bar && pctEl) {
      bar.style.width = `${pct}%`;
      pctEl.textContent = `${pct}%`;
      const stageEl = body.querySelector("p");
      if (stageEl) stageEl.textContent = stage;
    }
  }

  function handleComplete(payload: { pdfBase64?: string; texBase64?: string; filename: string }) {
    currentState = "done";
    currentPayload = payload;
    currentPct = 100;
    // Auto-expand panel to show download
    tab.style.display = "none";
    tab.style.background = "#2563eb";
    panel.style.display = "block";
    renderBody();
  }

  function handleError(error: string) {
    currentState = "error";
    currentError = error;
    // Auto-expand panel to show error
    tab.style.display = "none";
    tab.style.background = "#2563eb";
    panel.style.display = "block";
    renderBody();
  }

  // Primary: runtime messages from service worker
  chrome.runtime.onMessage.addListener((message: any) => {
    if (message.type === "TAILORING_PROGRESS") {
      handleProgress(message.payload.stage, message.payload.pct);
    } else if (message.type === "TAILORING_COMPLETE") {
      handleComplete(message.payload);
    } else if (message.type === "TAILORING_ERROR") {
      handleError(message.payload.error);
    }
  });

  // Fallback: storage changes
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "session" || !changes.tailoring_state) return;
    const state = changes.tailoring_state.newValue as {
      stage: string; pct: number;
      pdfBase64?: string; texBase64?: string; filename?: string; error?: string;
    } | undefined;
    if (!state) return;

    if (state.pdfBase64 || state.texBase64) {
      handleComplete({ ...state, filename: state.filename || "resume.tex" });
    } else if (state.error) {
      handleError(state.error);
    } else {
      handleProgress(state.stage, state.pct);
    }
  });
}

init();
