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
import { tailorBullets, tailorSkills, shortenBullets, expandBullets, refineBullets, testApiKey } from "./gemini";
import type { TailoredBullet, TailoredSkills } from "./gemini";

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
      const { jobDescription, jobTitle, company } = message.payload;
      handleTailoring(jobDescription, jobTitle, company);
      return false;
    }
    if (message.type === "OPEN_OPTIONS") {
      chrome.runtime.openOptionsPage();
      return false;
    }
  },
);

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

async function handleTailoring(jobDescription: string, jobTitle: string, company: string) {
  try {
    await clearTailoringState();
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

    // Fill in any missing tailoredText with originals
    const origMap = new Map(expBullets.map((b) => [b.id, b.originalText]));
    for (const b of tailoredBullets) {
      if (!b.tailoredText) {
        console.log(`[CV Tailor] Missing tailoredText for ${b.id}, using original`);
        b.tailoredText = origMap.get(b.id) ?? "";
      }
    }

    // Refinement pass: fix domain mismatches, length issues, keyword gaps
    await progress("Refining bullets...", 40);
    try {
      const refined = await refineBullets(
        jobDescription,
        expBullets,
        tailoredBullets,
        candidateSkills,
        customInstructions,
        jobTitle,
        company,
      );
      const refinedMap = new Map(refined.map((b) => [b.id, b.tailoredText]));
      for (const b of tailoredBullets) {
        const r = refinedMap.get(b.id);
        if (r) b.tailoredText = r;
      }
    } catch (err) {
      console.log("[CV Tailor] refineBullets failed, using first-pass results:", err);
    }

    // Post-process: only enforce max length (176 chars = 2 lines)
    const MAX_BULLET_LEN = 176;
    const tooLong = tailoredBullets.filter((b) => b.tailoredText.length > MAX_BULLET_LEN);

    if (tooLong.length > 0) {
      console.log(`[CV Tailor] ${tooLong.length} bullets over ${MAX_BULLET_LEN} chars, requesting shorter versions`);
      await progress("Shortening long bullets...", 45);
      try {
        const shortened = await shortenBullets(tooLong, MAX_BULLET_LEN);
        const shortenedMap = new Map(shortened.map((b) => [b.id, b.tailoredText]));
        for (const b of tailoredBullets) {
          const short = shortenedMap.get(b.id);
          if (short && short.length <= MAX_BULLET_LEN) {
            b.tailoredText = short;
          } else if (b.tailoredText.length > MAX_BULLET_LEN) {
            const orig = origMap.get(b.id);
            if (orig) {
              console.log(`[CV Tailor] Reverted bullet ${b.id}: still ${b.tailoredText.length} chars after retry`);
              b.tailoredText = orig;
            }
          }
        }
      } catch (err) {
        console.log("[CV Tailor] shortenBullets failed, reverting long bullets:", err);
        for (const b of tooLong) {
          const orig = origMap.get(b.id);
          if (orig) b.tailoredText = orig;
        }
      }
    }

    // Post-process: fix dead-zone bullets (89-159 chars cause ugly wrapping)
    const DEAD_ZONE_MIN = 89;
    const DEAD_ZONE_MAX = 159;
    const deadZone = tailoredBullets.filter(
      (b) => b.tailoredText.length >= DEAD_ZONE_MIN && b.tailoredText.length <= DEAD_ZONE_MAX,
    );

    if (deadZone.length > 0) {
      console.log(`[CV Tailor] ${deadZone.length} bullets in dead zone (${DEAD_ZONE_MIN}-${DEAD_ZONE_MAX} chars), shortening to ≤88`);
      await progress("Fixing line wrapping...", 50);
      try {
        const shortened = await shortenBullets(deadZone, 88);
        const shortenedMap = new Map(shortened.map((b) => [b.id, b.tailoredText]));
        // Collect bullets still in dead zone after shortening attempt
        const stillDead: TailoredBullet[] = [];
        for (const b of tailoredBullets) {
          const short = shortenedMap.get(b.id);
          if (short && short.length <= 88) {
            b.tailoredText = short;
          } else if (short && short.length >= DEAD_ZONE_MIN && short.length <= DEAD_ZONE_MAX) {
            // Still in dead zone — keep tailored content, try expanding to 2 lines
            stillDead.push({ id: b.id, tailoredText: short });
          }
        }
        // Second pass: expand dead-zone survivors to 160-176 chars (2 lines) instead of reverting
        if (stillDead.length > 0) {
          console.log(`[CV Tailor] ${stillDead.length} bullets still in dead zone, expanding to 2 lines`);
          try {
            const expanded = await expandBullets(stillDead, 160, MAX_BULLET_LEN);
            const expandedMap = new Map(expanded.map((b) => [b.id, b.tailoredText]));
            for (const b of tailoredBullets) {
              const exp = expandedMap.get(b.id);
              if (exp && (exp.length <= 88 || (exp.length >= 160 && exp.length <= MAX_BULLET_LEN))) {
                b.tailoredText = exp;
              } else if (exp && exp.length >= DEAD_ZONE_MIN && exp.length <= DEAD_ZONE_MAX) {
                // Still stuck — revert as last resort
                const orig = origMap.get(b.id);
                if (orig) {
                  console.log(`[CV Tailor] Reverted dead-zone bullet ${b.id}: ${exp.length} chars after expand`);
                  b.tailoredText = orig;
                }
              }
            }
          } catch (err) {
            console.log("[CV Tailor] dead-zone expand failed, reverting:", err);
            for (const b of stillDead) {
              const orig = origMap.get(b.id);
              if (orig) b.tailoredText = orig;
            }
          }
        }
      } catch (err) {
        console.log("[CV Tailor] dead-zone shortenBullets failed:", err);
      }
    }

    const tailoredMap = new Map(
      tailoredBullets.map((b) => [b.id, b.tailoredText]),
    );

    await progress("Updating resume...", 55);

    let modifiedTex = replaceBulletsInTex(rawTex, expBullets, tailoredMap);

    // Tailor skills: add missing JD skills + reorder (unless user disabled it)
    const tailorSkillsEnabled = await getTailorSkills();
    const skillsSection = resume.sections.find((s) => s.type === "skills");
    if (tailorSkillsEnabled && skillsSection?.entries[0]?.skillLines) {
      await progress("Tailoring skills...", 65);
      const tailoredSkills = await tailorSkills(
        jobDescription,
        skillsSection.entries[0].skillLines,
        ALWAYS_INCLUDE_SKILLS,
      );
      modifiedTex = replaceSkillsInTex(modifiedTex, tailoredSkills);
    }

    const baseName = `${resume.name.replace(/\s+/g, "_")}_resume`;

    await progress("Compiling PDF...", 80);

    const pdfBuffer = await compileTex(modifiedTex);

    if (pdfBuffer && pdfBuffer.byteLength > 0) {
      const bytes = new Uint8Array(pdfBuffer);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const pdfBase64 = btoa(binary);
      const filename = `${baseName}.pdf`;

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
      const filename = `${baseName}.tex`;
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
