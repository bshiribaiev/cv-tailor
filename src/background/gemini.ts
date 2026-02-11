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

  const prompt = `You are an expert resume tailoring assistant. Maximize keyword overlap between resume bullets and the job description.

STEP 1 — EXTRACT ALL JD KEYWORDS in these categories:
- Hard skills: languages, frameworks, databases, tools (e.g., Java, Spring Boot, MySQL, BitBucket)
- Process keywords: methodologies, practices (e.g., testing, code review, documentation, Agile, CI/CD)
- Domain keywords: industry terms, concepts (e.g., microservices, REST APIs, data pipelines)

STEP 2 — REWRITE EACH BULLET to incorporate JD keywords:

REWRITING RULES:
- Each bullet MUST contain 2-4 JD keywords from ANY category (hard skills, process, domain)
- You MAY swap similar technologies when the underlying work is equivalent:
  PostgreSQL→MySQL, Express.js→Spring Boot, GitHub→BitBucket, any DB→the JD's DB, etc.
- You MAY add process context to existing achievements:
  "Built X" → "Built and unit-tested X through code review"
  "Deployed Y" → "Deployed Y with automated testing and documentation"
- Keep the SAME achievement/metric/outcome — only adjust HOW it's described and WHAT tools are mentioned
- Do NOT fabricate new achievements or metrics. Do NOT change numbers, percentages, or dollar amounts.
- These skills should appear across bullets if relevant: ${alwaysIncludeSkills.join(", ")}

LENGTH RULES (one printed line ≈ 88 characters):
- Prefer ≤88 characters (1 line). Most bullets should aim for this.
- If you can't fit enough JD keywords in 88 chars, expand to 160-176 chars (2 lines) and pack in more keywords.
- NEVER output 89-159 characters — causes ugly wrapping. Either ≤88 or 160-176.
- NEVER exceed 176 characters.
- Count characters carefully for every bullet before returning.

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
  const prompt = `You are a resume tailoring assistant. Update skills to maximize match with the job description.

RULES:
- Reorder skills — put JD-required skills first in each category
- ADD missing JD-required tools/skills to the appropriate category (max 3 new per category)
- Prioritize skills the JD explicitly lists as "required" or "must-have"
- Do NOT remove any existing skills
- These must always appear: ${alwaysIncludeSkills.join(", ")}
- Keep comma-separated format
- Keep each category to one line (~85 chars max for items)

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
          temperature: 0.5,
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

export async function shortenBullets(
  apiKey: string,
  bullets: TailoredBullet[],
  maxLen: number,
): Promise<TailoredBullet[]> {
  const prompt = `Shorten each bullet to ≤${maxLen} characters. Keep all JD keywords and metrics. Cut filler words, combine clauses, use shorter synonyms. Do NOT remove technical terms or numbers.

BULLETS:
${JSON.stringify(bullets.map((b) => ({ id: b.id, text: b.tailoredText, chars: b.tailoredText.length })))}

Return JSON array: [{"id": "...", "tailoredText": "..."}]`;

  const result = await callGemini(apiKey, prompt);
  return JSON.parse(result) as TailoredBullet[];
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
