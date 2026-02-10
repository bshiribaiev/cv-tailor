/** Content script auto-injected on job sites — shows a floating "Tailor Resume" button */

function init() {
  // Don't inject twice
  if (document.getElementById("cv-tailor-fab")) return;

  const fab = document.createElement("div");
  fab.id = "cv-tailor-fab";
  fab.innerHTML = `
    <div style="
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 2147483647;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    ">
      <button id="cv-tailor-btn" style="
        background: #2563eb;
        color: white;
        border: none;
        border-radius: 12px;
        padding: 12px 20px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        display: flex;
        align-items: center;
        gap: 8px;
        transition: all 0.2s;
      ">
        <span style="font-size: 16px;">&#9998;</span>
        Tailor Resume
      </button>
      <div id="cv-tailor-status" style="
        display: none;
        background: white;
        border-radius: 12px;
        padding: 16px;
        margin-bottom: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        min-width: 240px;
        font-size: 13px;
        color: #333;
      "></div>
    </div>
  `;
  document.body.appendChild(fab);

  const btn = document.getElementById("cv-tailor-btn")!;
  const status = document.getElementById("cv-tailor-status")!;

  // Hover effect
  btn.addEventListener("mouseenter", () => {
    btn.style.background = "#1d4ed8";
    btn.style.transform = "scale(1.05)";
  });
  btn.addEventListener("mouseleave", () => {
    btn.style.background = "#2563eb";
    btn.style.transform = "scale(1)";
  });

  btn.addEventListener("click", () => {
    btn.style.display = "none";
    status.style.display = "block";
    status.innerHTML = `<p style="margin:0">Extracting job description...</p>`;

    // Extract JD from page
    const jd = extractJD();
    if (!jd.description || jd.description.length < 50) {
      status.innerHTML = `<p style="margin:0;color:#dc2626">Could not extract job description from this page.</p>
        <button id="cv-tailor-retry" style="margin-top:8px;padding:6px 12px;background:#e5e7eb;border:none;border-radius:6px;cursor:pointer;font-size:12px;">Retry</button>`;
      document.getElementById("cv-tailor-retry")?.addEventListener("click", () => {
        status.style.display = "none";
        btn.style.display = "flex";
      });
      return;
    }

    status.innerHTML = `
      <p style="margin:0 0 8px 0;font-weight:600">${jd.title || "Job posting"} ${jd.company ? `@ ${jd.company}` : ""}</p>
      <p style="margin:0 0 4px 0">Tailoring resume...</p>
      <div style="background:#e5e7eb;border-radius:4px;height:6px;overflow:hidden">
        <div id="cv-tailor-progress" style="background:#2563eb;height:100%;width:10%;transition:width 0.3s"></div>
      </div>
      <p id="cv-tailor-pct" style="margin:4px 0 0;font-size:11px;color:#666">10%</p>
    `;

    // Send to service worker
    chrome.runtime.sendMessage({
      type: "START_TAILORING",
      payload: { jobDescription: jd.description },
    });
  });

  // Listen for state changes via chrome.storage (reliable for content scripts)
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "session" || !changes.tailoring_state) return;
    const state = changes.tailoring_state.newValue;
    if (!state) return;

    if (state.pdfBase64 || state.texBase64) {
      const isPdf = !!state.pdfBase64;
      const hint = isPdf ? "" : `<p style="margin:0 0 6px 0;font-size:11px;color:#666">Compile .tex in Overleaf for PDF</p>`;
      status.innerHTML = `
        <p style="margin:0 0 8px 0;color:#16a34a;font-weight:600">Resume tailored!</p>
        ${hint}
        <button id="cv-tailor-download" style="
          width:100%;padding:8px;background:#16a34a;color:white;border:none;
          border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;
        ">Download ${isPdf ? "PDF" : ".tex"}</button>
        <button id="cv-tailor-again" style="
          width:100%;padding:8px;background:#e5e7eb;border:none;
          border-radius:8px;cursor:pointer;font-size:12px;margin-top:6px;
        ">Tailor Another</button>
      `;
      document.getElementById("cv-tailor-download")?.addEventListener("click", () => {
        let blob: Blob;
        if (state.pdfBase64) {
          const bytes = Uint8Array.from(atob(state.pdfBase64), (c) => c.charCodeAt(0));
          blob = new Blob([bytes], { type: "application/pdf" });
        } else {
          const content = decodeURIComponent(escape(atob(state.texBase64!)));
          blob = new Blob([content], { type: "text/plain" });
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = state.filename || "Resume_Tailored.pdf";
        a.click();
        URL.revokeObjectURL(url);
      });
      document.getElementById("cv-tailor-again")?.addEventListener("click", () => {
        status.style.display = "none";
        btn.style.display = "flex";
      });
    } else if (state.error) {
      status.innerHTML = `
        <p style="margin:0;color:#dc2626">${state.error}</p>
        <button id="cv-tailor-retry2" style="margin-top:8px;padding:6px 12px;background:#e5e7eb;border:none;border-radius:6px;cursor:pointer;font-size:12px;">Try Again</button>
      `;
      document.getElementById("cv-tailor-retry2")?.addEventListener("click", () => {
        status.style.display = "none";
        btn.style.display = "flex";
      });
    } else {
      const bar = document.getElementById("cv-tailor-progress");
      const pct = document.getElementById("cv-tailor-pct");
      if (bar) bar.style.width = `${state.pct}%`;
      if (pct) pct.textContent = `${state.stage} ${state.pct}%`;
    }
  });
}

function extractJD(): { title: string; company: string; description: string } {
  const host = window.location.hostname;

  if (host.includes("linkedin.com")) {
    const desc =
      document.querySelector<HTMLElement>(".jobs-description-content__text") ??
      document.querySelector<HTMLElement>(".description__text") ??
      document.querySelector<HTMLElement>('[class*="jobs-description"]');
    if (desc) {
      const title =
        document.querySelector<HTMLElement>(".job-details-jobs-unified-top-card__job-title") ??
        document.querySelector<HTMLElement>("h1");
      const company =
        document.querySelector<HTMLElement>(".job-details-jobs-unified-top-card__company-name");
      return {
        title: title?.textContent?.trim() ?? "",
        company: company?.textContent?.trim() ?? "",
        description: desc.innerText.trim(),
      };
    }
  }

  if (host.includes("greenhouse.io")) {
    const desc = document.querySelector<HTMLElement>("#content");
    if (desc) {
      return {
        title: document.querySelector<HTMLElement>(".app-title")?.textContent?.trim() ?? "",
        company: document.querySelector<HTMLElement>(".company-name")?.textContent?.trim() ?? "",
        description: desc.innerText.trim(),
      };
    }
  }

  if (host.includes("lever.co")) {
    const desc = document.querySelector<HTMLElement>(".section-wrapper.page-full-width");
    if (desc) {
      return {
        title: document.querySelector<HTMLElement>(".posting-headline h2")?.textContent?.trim() ?? "",
        company: "",
        description: desc.innerText.trim(),
      };
    }
  }

  if (host.includes("workday.com") || host.includes("myworkday")) {
    const desc = document.querySelector<HTMLElement>('[data-automation-id="jobPostingDescription"]');
    if (desc) {
      return {
        title: document.querySelector<HTMLElement>('[data-automation-id="jobPostingHeader"]')?.textContent?.trim() ?? "",
        company: "",
        description: desc.innerText.trim(),
      };
    }
  }

  // Generic
  const candidates = document.querySelectorAll<HTMLElement>(
    "article, main, [role='main'], .content, .job-description, .description, #content",
  );
  let best: HTMLElement | null = null;
  let bestLen = 0;
  for (const el of candidates) {
    if (el.innerText.length > bestLen) {
      bestLen = el.innerText.length;
      best = el;
    }
  }

  return {
    title: document.querySelector<HTMLElement>("h1")?.textContent?.trim() ?? document.title,
    company: "",
    description: best?.innerText?.trim() ?? document.body.innerText.slice(0, 5000),
  };
}

init();
