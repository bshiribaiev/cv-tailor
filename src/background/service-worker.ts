import type { Message } from "../shared/messages";
import {
  getProvider,
  getApiKey,
  getAnthropicApiKey,
  getResume,
  saveTailoringState,
  clearTailoringState,
  getTailorSkills,
  getCustomInstructions,
} from "../shared/storage";
import { tailorBullets, tailorSkills, testApiKey } from "./llm";
import type { TailoredSkills } from "./llm";

// Allow content scripts to access session storage (for floating button progress)
chrome.storage.session.setAccessLevel({ accessLevel: "TRUSTED_AND_UNTRUSTED_CONTEXTS" });

const ALWAYS_INCLUDE_SKILLS = [
  "Python",
  "Java",
  "Spring Boot",
  "Next.js",
  "LangGraph",
  "C++",
  "Git",
];

chrome.runtime.onMessage.addListener(
  (message: Message, sender, sendResponse) => {
    if (message.type === "GET_STATUS") {
      handleGetStatus().then(sendResponse);
      return true;
    }
    if (message.type === "TEST_API_KEY") {
      testApiKey(message.payload.apiKey, message.payload.provider).then(sendResponse);
      return true;
    }
    if (message.type === "START_TAILORING") {
      // Resolve tabId: content script has sender.tab.id, popup must query active tab
      const resolveTab = sender.tab?.id
        ? Promise.resolve(sender.tab.id)
        : chrome.tabs.query({ active: true, currentWindow: true }).then(([t]) => t?.id);
      resolveTab.then((tabId) => {
        if (!tabId) return;
        const { jobDescription, jobTitle, company } = message.payload;
        handleTailoring(jobDescription, jobTitle, company, tabId);
      });
      return false;
    }
    if (message.type === "GET_TAB_ID") {
      sendResponse({ tabId: sender.tab?.id ?? null });
      return true;
    }
    if (message.type === "OPEN_OPTIONS") {
      chrome.runtime.openOptionsPage();
      return false;
    }
    if (message.type === "DOWNLOAD_FILE") {
      handleDownload(message.payload);
      return false;
    }
    if (message.type === "FETCH_GREENHOUSE_JD") {
      fetchGreenhouseJD(message.payload.board, message.payload.jobId).then(sendResponse);
      return true;
    }
  },
);

function handleDownload(payload: { pdfBase64?: string; texBase64?: string; filename: string }) {
  let dataUrl: string;
  if (payload.pdfBase64) {
    dataUrl = `data:application/pdf;base64,${payload.pdfBase64}`;
  } else {
    dataUrl = `data:text/plain;base64,${payload.texBase64}`;
  }
  chrome.downloads.download({
    url: dataUrl,
    filename: payload.filename || "resume.pdf",
    conflictAction: "overwrite",
    saveAs: false,
  });
}

async function fetchGreenhouseJD(board: string, jobId: string) {
  try {
    const res = await fetch(
      `https://boards-api.greenhouse.io/v1/boards/${board}/jobs/${jobId}`,
    );
    if (!res.ok) return null;
    const data = await res.json();
    // content is HTML — strip tags for plain text
    const html = (data.content as string) || "";
    const text = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    const title = (data.title as string) || "";
    const company = (data.company?.name as string) || "";
    if (text.length < 50) return null;
    return { title, company, description: text };
  } catch {
    return null;
  }
}

async function handleGetStatus() {
  const provider = await getProvider();
  const apiKey = provider === "anthropic"
    ? await getAnthropicApiKey()
    : await getApiKey();
  const resume = await getResume();
  return {
    type: "STATUS_RESULT" as const,
    payload: { hasResume: !!resume, hasApiKey: !!apiKey },
  };
}

/** Truncate bullet at last comma/semicolon before 105 chars if in dead zone (106-179) */
function fixBulletLength(text: string): string {
  const len = text.length;
  if (len <= 105 || len >= 180) return text;

  // Dead zone: try to cut at last comma or semicolon before char 105
  const slice = text.slice(0, 105);
  const lastCut = Math.max(slice.lastIndexOf(","), slice.lastIndexOf(";"));
  if (lastCut >= 60) {
    const truncated = text.slice(0, lastCut).trimEnd();
    console.log(`[CV Tailor] Truncated bullet from ${len} to ${truncated.length} chars`);
    return truncated;
  }

  // No good cut point — keep as-is (ugly wrap but still tailored)
  console.log(`[CV Tailor] Bullet in dead zone (${len} chars), no clean cut point`);
  return text;
}

/** Escape special LaTeX characters in plain text */
function texEscape(text: string): string {
  return text
    .replace(/%/g, "\\%")
    .replace(/\$/g, "\\$")
    .replace(/&/g, "\\&")
    .replace(/#/g, "\\#")
    .replace(/_/g, "\\_")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}");
}

/** Replace Experience bullet \item lines in raw .tex with tailored text */
function replaceBulletsInTex(
  rawTex: string,
  bullets: { id: string; originalText: string }[],
  tailoredMap: Map<string, string>,
): string {
  const expStart = rawTex.indexOf("\\section{EXPERIENCE}");
  if (expStart === -1) return rawTex;

  const nextSection = rawTex.indexOf(
    "\\section{",
    expStart + "\\section{EXPERIENCE}".length,
  );
  const expEnd = nextSection === -1 ? rawTex.length : nextSection;

  let expSection = rawTex.substring(expStart, expEnd);

  let bulletIdx = 0;
  expSection = expSection.replace(/\\item\s+(.+)/g, (match) => {
    if (bulletIdx < bullets.length) {
      const bullet = bullets[bulletIdx];
      bulletIdx++;
      const tailored = tailoredMap.get(bullet.id);
      if (tailored) {
        return `\\item ${texEscape(tailored)}`;
      }
    }
    return match;
  });

  return (
    rawTex.substring(0, expStart) + expSection + rawTex.substring(expEnd)
  );
}

/** Replace skill items in raw .tex within SKILLS section */
function replaceSkillsInTex(
  rawTex: string,
  tailoredSkills: TailoredSkills[],
): string {
  const skillsStart = rawTex.indexOf("\\section{SKILLS}");
  if (skillsStart === -1) return rawTex;

  const endDoc = rawTex.indexOf("\\end{document}", skillsStart);
  const skillsEnd = endDoc !== -1 ? endDoc : rawTex.length;

  let section = rawTex.substring(skillsStart, skillsEnd);

  for (const skill of tailoredSkills) {
    // Match \textbf{<label>:} <items> by first word of label
    const firstWord = skill.label
      .split(/[\s/]+/)[0]
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(
      `(\\\\textbf\\{[^}]*${firstWord}[^}]*:\\})\\s*(.+)`,
    );
    section = section.replace(regex, `$1 ${texEscape(skill.tailoredItems)}`);
  }

  return rawTex.substring(0, skillsStart) + section + rawTex.substring(skillsEnd);
}

/** Try to compile .tex to PDF via online LaTeX service */
async function compileTex(tex: string): Promise<ArrayBuffer | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);

  try {
    const res = await fetch("https://latex.ytotech.com/builds/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        compiler: "pdflatex",
        resources: [{ main: true, content: tex }],
      }),
    });

    clearTimeout(timeout);

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.log(
        `[CV Tailor] LaTeX compile failed (${res.status}): ${errText.slice(0, 200)}`,
      );
      return null;
    }

    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("pdf") && !ct.includes("octet-stream")) {
      console.log(`[CV Tailor] Unexpected content-type: ${ct}`);
      return null;
    }

    return await res.arrayBuffer();
  } catch (err) {
    clearTimeout(timeout);
    console.log("[CV Tailor] LaTeX compile error:", err);
    return null;
  }
}

async function handleTailoring(jobDescription: string, jobTitle: string, company: string, tabId: number) {
  async function progress(stage: string, pct: number) {
    await saveTailoringState(tabId, { stage, pct });
    broadcast(tabId, { type: "TAILORING_PROGRESS", payload: { tabId, stage, pct } });
  }

  try {
    await clearTailoringState(tabId);
    await progress("Preparing...", 10);

    const resumeData = await getResume();
    if (!resumeData) throw new Error("No resume uploaded");

    const { rawTex, parsed: resume } = resumeData;

    // Collect only Experience bullets
    const expBullets: { id: string; originalText: string }[] = [];
    for (const section of resume.sections) {
      if (section.type === "experience") {
        for (const entry of section.entries) {
          expBullets.push(...entry.bullets);
        }
      }
    }

    if (expBullets.length === 0)
      throw new Error("No experience bullets found");

    // Collect candidate's skills for context
    const skillsSec = resume.sections.find((s) => s.type === "skills");
    const candidateSkills = skillsSec?.entries[0]?.skillLines
      ?.map((sl) => `${sl.label}: ${sl.items}`)
      .join("; ") ?? "";

    const customInstructions = await getCustomInstructions();

    await progress("Tailoring experience...", 30);

    const tailoredBullets = await tailorBullets(
      jobDescription,
      expBullets,
      ALWAYS_INCLUDE_SKILLS,
      candidateSkills,
      customInstructions,
      jobTitle,
      company,
    );

    // Fill in missing, fix bad lengths
    const origMap = new Map(expBullets.map((b) => [b.id, b.originalText]));
    for (const b of tailoredBullets) {
      if (!b.tailoredText) {
        console.log(`[CV Tailor] Missing tailoredText for ${b.id}, using original`);
        b.tailoredText = origMap.get(b.id) ?? "";
        continue;
      }
      b.tailoredText = fixBulletLength(b.tailoredText);
    }

    const tailoredMap = new Map(
      tailoredBullets.map((b) => [b.id, b.tailoredText]),
    );

    await progress("Updating resume...", 50);

    let modifiedTex = replaceBulletsInTex(rawTex, expBullets, tailoredMap);

    // Tailor skills: add missing JD skills + reorder (unless user disabled it)
    const tailorSkillsEnabled = await getTailorSkills();
    const skillsSection = resume.sections.find((s) => s.type === "skills");
    if (tailorSkillsEnabled && skillsSection?.entries[0]?.skillLines) {
      await progress("Tailoring skills...", 60);
      const tailoredSkills = await tailorSkills(
        jobDescription,
        skillsSection.entries[0].skillLines,
        ALWAYS_INCLUDE_SKILLS,
      );
      modifiedTex = replaceSkillsInTex(modifiedTex, tailoredSkills);
    }

    const baseName = `${resume.name.replace(/\s+/g, "_")}_resume`;
    // Sanitize for folder name (strip illegal chars, collapse whitespace)
    const sanitize = (s: string) => s.replace(/[<>:"/\\|?*]/g, "").replace(/\s+/g, " ").trim();
    const companyClean = sanitize(company) || "Unknown";
    const titleClean = sanitize(jobTitle);
    // Short hash to avoid collisions when company/title are identical
    const hash = Array.from(jobDescription.slice(0, 200)).reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0).toString(36).slice(-4);
    const companyFolder = titleClean
      ? `${companyClean} - ${titleClean}`
      : `${companyClean} (${hash})`;

    await progress("Compiling PDF...", 80);

    const pdfBuffer = await compileTex(modifiedTex);

    if (pdfBuffer && pdfBuffer.byteLength > 0) {
      const bytes = new Uint8Array(pdfBuffer);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const pdfBase64 = btoa(binary);
      const filename = `${companyFolder}/${baseName}.pdf`;

      await saveTailoringState(tabId, {
        stage: "done",
        pct: 100,
        pdfBase64,
        filename,
      });
      broadcast(tabId, {
        type: "TAILORING_COMPLETE",
        payload: { tabId, pdfBase64, filename },
      });
    } else {
      // Fallback: offer .tex download
      console.log("[CV Tailor] PDF compilation unavailable, offering .tex");
      const filename = `${companyFolder}/${baseName}.tex`;
      const texBase64 = btoa(unescape(encodeURIComponent(modifiedTex)));

      await saveTailoringState(tabId, {
        stage: "done",
        pct: 100,
        texBase64,
        filename,
      });
      broadcast(tabId, {
        type: "TAILORING_COMPLETE",
        payload: { tabId, texBase64, filename },
      });
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await saveTailoringState(tabId, { stage: "error", pct: 0, error });
    broadcast(tabId, { type: "TAILORING_ERROR", payload: { tabId, error } });
  }
}

async function broadcast(tabId: number, message: Message) {
  // Extension pages (popup, options)
  chrome.runtime.sendMessage(message).catch(() => {});
  // Content script on the originating tab
  chrome.tabs.sendMessage(tabId, message).catch(() => {});
}

