import { getModel } from "../shared/storage";

const GEMINI_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models";

export interface TailoredBullet {
  id: string;
  tailoredText: string;
}

export interface TailoredSkills {
  label: string;
  tailoredItems: string;
}

export async function tailorBullets(
  apiKey: string,
  jobDescription: string,
  bullets: { id: string; originalText: string }[],
  alwaysIncludeSkills: string[],
): Promise<TailoredBullet[]> {
  const bulletsWithLen = bullets.map((b) => ({
    id: b.id,
    text: b.originalText,
    chars: b.originalText.length,
  }));

  const prompt = `You are an expert resume tailoring assistant. Your goal: maximize keyword match between resume bullets and the job description's REQUIRED SKILLS.

STEP 1 — EXTRACT JD REQUIREMENTS:
Before rewriting, identify ALL required skills, technologies, frameworks, and keywords from the job description. These are your primary targets.

STEP 2 — REWRITE EACH BULLET using Google's XYZ format:
"Accomplished [X] by implementing [Y], resulting in [Z]"
- X = what you accomplished (action + deliverable)
- Y = how you did it (technologies, methods — USE JD KEYWORDS HERE)
- Z = measurable impact (metrics, outcomes)

REWRITING RULES:
- AGGRESSIVELY incorporate JD-required skills into every bullet. Each bullet should contain 2-4 JD keywords.
- Replace generic terms with JD-specific ones (e.g., if JD says "Spring Boot MVC" don't just say "backend")
- If the original bullet used a technology, you MAY swap it for the JD-equivalent IF the work is similar (e.g., "Express.js backend" → "RESTful Spring Boot microservice" if the person has Spring Boot experience)
- Keep the same achievement/metric/outcome — only adjust HOW it's described
- Do NOT fabricate new achievements or metrics. Do NOT change numbers, percentages, or dollar amounts.
- Do NOT add technologies the candidate never used — only reframe existing work using JD terminology
- These skills should appear across bullets if relevant: ${alwaysIncludeSkills.join(", ")}

LENGTH RULES (critical — one printed line ≈ 88 characters, resume MUST fit one page):
- MOST bullets MUST be ≤88 characters (one printed line). Prefer this strongly.
- Only 1-2 critical bullets (with important metrics) may be 2 lines: 160-176 characters
- NEVER exceed 176 characters. Three-line bullets break the layout.
- NEVER output 89-159 characters — causes ugly wrapping
- When in doubt, make it SHORTER. Cut filler words. Concise > comprehensive.
- Count characters carefully for every bullet before returning

JOB DESCRIPTION:
${jobDescription}

RESUME BULLETS (with character counts):
${JSON.stringify(bulletsWithLen)}

Return a JSON array: [{"id": "...", "tailoredText": "..."}]`;

  const result = await callGemini(apiKey, prompt);
  return JSON.parse(result) as TailoredBullet[];
}

export async function tailorSkills(
  apiKey: string,
  jobDescription: string,
  skillLines: { label: string; items: string }[],
  alwaysIncludeSkills: string[],
): Promise<TailoredSkills[]> {
  const prompt = `You are a resume tailoring assistant. Given a job description and skill categories from a resume, update the skills to better match the job.

RULES:
- Reorder skills within each category — put most relevant to the job first
- If the job requires a language, framework, or tool that fits a category but ISN'T listed, ADD it (max 2 new skills per category)
- Do NOT remove any existing skills
- These skills must always appear: ${alwaysIncludeSkills.join(", ")}
- Keep comma-separated format
- Keep each category to one line (~80 chars max for the items)

JOB DESCRIPTION:
${jobDescription}

SKILL CATEGORIES:
${JSON.stringify(skillLines)}

Return a JSON array: [{"label": "...", "tailoredItems": "..."}]`;

  const result = await callGemini(apiKey, prompt);
  return JSON.parse(result) as TailoredSkills[];
}

async function callGemini(apiKey: string, prompt: string): Promise<string> {
  const model = await getModel();
  const url = `${GEMINI_BASE}/${model}:generateContent?key=${apiKey}`;
  console.log(`[CV Tailor] Calling Gemini model: ${model}`);

  const controller = new AbortController();
  const timeoutMs = 120000;
  const timeout = setTimeout(() => {
    console.log(`[CV Tailor] Request timed out after ${timeoutMs / 1000}s`);
    controller.abort();
  }, timeoutMs);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3,
          responseMimeType: "application/json",
        },
      }),
    });

    clearTimeout(timeout);
    console.log(`[CV Tailor] Response status: ${res.status}`);

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Gemini API error (${res.status}): ${err}`);
    }

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      console.log("[CV Tailor] Response data:", JSON.stringify(data).slice(0, 500));
      throw new Error("Empty response from Gemini");
    }
    console.log(`[CV Tailor] Got response (${text.length} chars)`);
    return text;
  } catch (err) {
    clearTimeout(timeout);
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error(`Request timed out after ${timeoutMs / 1000}s (model: ${model}). Try a different model in settings.`);
    }
    throw err;
  }
}

export async function testApiKey(apiKey: string): Promise<{ valid: boolean; error?: string }> {
  try {
    const result = await callGemini(apiKey, 'Respond with exactly: {"ok": true}');
    const parsed = JSON.parse(result);
    return { valid: parsed.ok === true };
  } catch (err) {
    return { valid: false, error: err instanceof Error ? err.message : String(err) };
  }
}
