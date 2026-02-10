import type { Message } from "../shared/messages";
import {
  getApiKey,
  getResume,
  saveTailoringState,
  clearTailoringState,
} from "../shared/storage";
import { tailorBullets, testApiKey } from "./gemini";

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
      testApiKey(message.payload.apiKey).then(sendResponse);
      return true;
    }
    if (message.type === "START_TAILORING") {
      handleTailoring(message.payload.jobDescription);
      return false;
    }
  },
);

async function handleGetStatus() {
  const apiKey = await getApiKey();
  const resume = await getResume();
  return {
    type: "STATUS_RESULT" as const,
    payload: { hasResume: !!resume, hasApiKey: !!apiKey },
  };
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

async function handleTailoring(jobDescription: string) {
  try {
    await clearTailoringState();
    await progress("Preparing...", 10);

    const apiKey = await getApiKey();
    if (!apiKey) throw new Error("No API key configured");

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

    await progress("Tailoring experience...", 30);

    const tailoredBullets = await tailorBullets(
      apiKey,
      jobDescription,
      expBullets,
      ALWAYS_INCLUDE_SKILLS,
    );

    const tailoredMap = new Map(
      tailoredBullets.map((b) => [b.id, b.tailoredText]),
    );

    await progress("Updating resume...", 60);

    const modifiedTex = replaceBulletsInTex(rawTex, expBullets, tailoredMap);
    const baseName = resume.name.replace(/\s+/g, "_");

    await progress("Compiling PDF...", 75);

    const pdfBuffer = await compileTex(modifiedTex);

    if (pdfBuffer && pdfBuffer.byteLength > 0) {
      const bytes = new Uint8Array(pdfBuffer);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const pdfBase64 = btoa(binary);
      const filename = `${baseName}_Resume_Tailored.pdf`;

      await saveTailoringState({
        stage: "done",
        pct: 100,
        pdfBase64,
        filename,
      });
      broadcast({
        type: "TAILORING_COMPLETE",
        payload: { pdfBase64, filename },
      });
    } else {
      // Fallback: offer .tex download
      console.log("[CV Tailor] PDF compilation unavailable, offering .tex");
      const filename = `${baseName}_Resume_Tailored.tex`;
      const texBase64 = btoa(unescape(encodeURIComponent(modifiedTex)));

      await saveTailoringState({
        stage: "done",
        pct: 100,
        texBase64,
        filename,
      });
      broadcast({
        type: "TAILORING_COMPLETE",
        payload: { texBase64, filename },
      });
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await saveTailoringState({ stage: "error", pct: 0, error });
    broadcast({ type: "TAILORING_ERROR", payload: { error } });
  }
}

async function broadcast(message: Message) {
  // Extension pages (popup, options)
  chrome.runtime.sendMessage(message).catch(() => {});
  // Content scripts (floating button)
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, message).catch(() => {});
    }
  } catch {}
}

async function progress(stage: string, pct: number) {
  await saveTailoringState({ stage, pct });
  broadcast({ type: "TAILORING_PROGRESS", payload: { stage, pct } });
}
