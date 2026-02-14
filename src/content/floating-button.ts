/** Content script injected on all pages — shows FAB only when job posting detected */

import { extractJobDescription } from "./extractor";

/** Lightweight check: is this page likely a job posting? */
function isJobPage(): boolean {
  // Skip iframes
  if (window !== window.top) return false;

  const url = window.location.href.toLowerCase();

  // URL path/param signals
  const urlSignals = [
    "/jobs/", "/job/", "/careers/", "/career/", "/positions/", "/position/",
    "/openings/", "/opening/", "/vacancies/", "/vacancy/",
    "/apply", "gh_jid=", "lever_jid=", "ashbyhq.com",
  ];
  if (urlSignals.some((s) => url.includes(s))) return true;

  // Known ATS selectors
  const atsSelectors = [
    '[data-automation-id="jobPostingDescription"]', // Workday
    ".posting-headline",                            // Lever
    "#grnhse_app",                                  // Greenhouse embed
    ".jobs-description-content__text",              // LinkedIn
    ".job-description", ".jobDescription",
    "#job-description", "#jobDescription",
    '[class*="JobDescription"]',                    // Ashby (uses dynamic class names)
  ];
  if (atsSelectors.some((s) => document.querySelector(s))) return true;

  // Keyword density in first 10k chars
  const text = document.body?.innerText?.toLowerCase().slice(0, 10000) ?? "";
  const keywords = [
    "qualifications", "responsibilities", "requirements",
    "apply now", "job description", "equal opportunity",
  ];
  const hits = keywords.filter((k) => text.includes(k)).length;
  return hits >= 2;
}

/** Find Greenhouse board token from embedded script tags on the page */
function findGreenhouseBoardToken(): string | null {
  const scripts = document.querySelectorAll<HTMLScriptElement>("script[src]");
  for (const s of scripts) {
    const match = s.src.match(/boards\.greenhouse\.io\/.*[?&]for=([^&]+)/);
    if (match) return match[1];
  }
  // Also check iframes
  const iframes = document.querySelectorAll<HTMLIFrameElement>("iframe[src]");
  for (const f of iframes) {
    const match = f.src.match(/boards\.greenhouse\.io\/.*[?&]for=([^&]+)/);
    if (match) return match[1];
  }
  return null;
}

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

  const host = document.createElement("div");
  host.id = "cv-tailor-fab";
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>
      #cv-tailor-root {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 13px;
        color: #333;
        line-height: 1.4;
        text-transform: none;
        letter-spacing: normal;
        font-weight: normal;
        font-style: normal;
        text-align: left;
        word-spacing: normal;
        direction: ltr;
      }
      button, p, span, div {
        font-family: inherit;
        text-transform: none;
        letter-spacing: normal;
      }
    </style>
    <div id="cv-tailor-root" style="
      position: fixed;
      bottom: 80px;
      right: 0;
      z-index: 2147483647;
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
  document.body.appendChild(host);

  const tab = shadow.getElementById("cv-tailor-tab")!;
  const panel = shadow.getElementById("cv-tailor-panel")!;
  const body = shadow.getElementById("cv-tailor-body")!;
  const settingsBtn = shadow.getElementById("cv-tailor-settings")!;
  const closeBtn = shadow.getElementById("cv-tailor-close")!;

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
      shadow.getElementById("cv-tailor-start")?.addEventListener("click", () => {
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
      shadow.getElementById("cv-tailor-download")?.addEventListener("click", () => downloadFile(currentPayload!));
      shadow.getElementById("cv-tailor-again")?.addEventListener("click", () => {
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
      shadow.getElementById("cv-tailor-retry")?.addEventListener("click", () => {
        currentState = "idle";
        currentError = "";
        panel.style.display = "none";
        tab.style.display = "flex";
        tab.style.background = "#2563eb";
      });
    }
  }

  function beginTailoring(description: string, title: string, company: string) {
    currentState = "tailoring";
    currentStage = "Tailoring resume...";
    currentPct = 10;
    renderBody();
    chrome.runtime.sendMessage({
      type: "START_TAILORING",
      payload: { jobDescription: description, jobTitle: title, company },
    });
  }

  function showExtractionError() {
    currentState = "error";
    currentError = "Could not extract job description from this page.";
    tab.style.display = "none";
    tab.style.background = "#2563eb";
    panel.style.display = "block";
    renderBody();
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
      if (jd.description && jd.description.length >= 50) {
        beginTailoring(jd.description, jd.title, jd.company);
        return;
      }

      // Fallback: Greenhouse embedded via iframe (gh_jid in URL)
      const ghJid = new URLSearchParams(location.search).get("gh_jid");
      const ghBoard = findGreenhouseBoardToken();
      if (ghJid && ghBoard) {
        currentStage = "Fetching job description...";
        renderBody();
        chrome.runtime.sendMessage(
          { type: "FETCH_GREENHOUSE_JD", payload: { board: ghBoard, jobId: ghJid } },
          (ghRes: any) => {
            if (ghRes?.title || ghRes?.description) {
              beginTailoring(ghRes.description, ghRes.title, ghRes.company);
            } else {
              showExtractionError();
            }
          },
        );
        return;
      }

      showExtractionError();
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
    // Use chrome.downloads API with overwrite to replace existing file
    chrome.downloads.download({
      url,
      filename: payload.filename || "resume.pdf",
      conflictAction: "overwrite", // Replaces existing file instead of adding (1), (2), etc.
      saveAs: false, // Don't prompt user
    }, () => {
      URL.revokeObjectURL(url);
    });
  }

  function handleProgress(stage: string, pct: number) {
    currentState = "tailoring";
    currentStage = stage;
    currentPct = pct;
    tab.style.background = "#f59e0b";
    // Update in-place if panel is open
    const bar = shadow.getElementById("cv-tailor-progress");
    const pctEl = shadow.getElementById("cv-tailor-pct");
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

if (isJobPage()) init();
