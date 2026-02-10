import type { Message } from "../shared/messages";
import type { Resume } from "../parser/types";
import {
  getApiKey,
  getResume,
  saveTailoringState,
  clearTailoringState,
} from "../shared/storage";
import { tailorBullets, tailorSkills } from "./gemini";
import { generatePdf } from "../pdf/generator";

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
      return true; // async
    }
    if (message.type === "START_TAILORING") {
      handleTailoring(message.payload.jobDescription);
      return false;
    }
    if (message.type === "JOB_DESC_RESULT") {
      // Forwarded from content script — handled in tailoring flow
      return false;
    }
  },
);

async function handleGetStatus() {
  const apiKey = await getApiKey();
  const resume = await getResume();
  return {
    type: "STATUS_RESULT" as const,
    payload: {
      hasResume: !!resume,
      hasApiKey: !!apiKey,
    },
  };
}

async function handleTailoring(jobDescription: string) {
  try {
    await clearTailoringState();
    await progress("Preparing...", 10);

    const apiKey = await getApiKey();
    if (!apiKey) throw new Error("No API key configured");

    const resumeData = await getResume();
    if (!resumeData) throw new Error("No resume uploaded");

    const resume = resumeData.parsed;

    await progress("Tailoring bullets...", 30);

    // Collect all bullets from experience + projects
    const allBullets: { id: string; originalText: string }[] = [];
    for (const section of resume.sections) {
      if (section.type === "experience" || section.type === "projects") {
        for (const entry of section.entries) {
          allBullets.push(...entry.bullets);
        }
      }
    }

    // Tailor bullets
    const tailoredBullets = await tailorBullets(
      apiKey,
      jobDescription,
      allBullets,
      ALWAYS_INCLUDE_SKILLS,
    );

    // Apply tailored text back to resume
    const bulletMap = new Map(
      tailoredBullets.map((b) => [b.id, b.tailoredText]),
    );

    const tailoredResume: Resume = JSON.parse(JSON.stringify(resume));
    for (const section of tailoredResume.sections) {
      if (section.type === "experience" || section.type === "projects") {
        for (const entry of section.entries) {
          for (const bullet of entry.bullets) {
            const tailored = bulletMap.get(bullet.id);
            if (tailored) bullet.tailoredText = tailored;
          }
        }
      }
    }

    await progress("Tailoring skills...", 60);

    // Tailor skills
    const skillsSection = tailoredResume.sections.find(
      (s) => s.type === "skills",
    );
    if (skillsSection?.entries[0]?.skillLines) {
      const tailoredSkills = await tailorSkills(
        apiKey,
        jobDescription,
        skillsSection.entries[0].skillLines,
        ALWAYS_INCLUDE_SKILLS,
      );
      const skillMap = new Map(
        tailoredSkills.map((s) => [s.label, s.tailoredItems]),
      );
      for (const sl of skillsSection.entries[0].skillLines) {
        const tailored = skillMap.get(sl.label);
        if (tailored) sl.tailoredItems = tailored;
      }
    }

    await progress("Generating PDF...", 80);

    // Generate PDF
    const pdfBase64 = await generatePdf(tailoredResume);

    // Create filename
    const filename = `${resume.name.replace(/\s+/g, "_")}_Resume_Tailored.pdf`;

    await saveTailoringState({
      stage: "done",
      pct: 100,
      pdfBase64,
      filename,
    });

    // Notify popup
    chrome.runtime.sendMessage({
      type: "TAILORING_COMPLETE",
      payload: { pdfBase64, filename },
    } as Message).catch(() => {
      // Popup might be closed
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await saveTailoringState({ stage: "error", pct: 0, error });
    chrome.runtime.sendMessage({
      type: "TAILORING_ERROR",
      payload: { error },
    } as Message).catch(() => {});
  }
}

async function progress(stage: string, pct: number) {
  await saveTailoringState({ stage, pct });
  chrome.runtime.sendMessage({
    type: "TAILORING_PROGRESS",
    payload: { stage, pct },
  } as Message).catch(() => {});
}
