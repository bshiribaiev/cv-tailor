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

  const prompt = `You are a resume tailoring assistant. Given a job description and resume bullet points, reword each bullet to naturally incorporate relevant keywords from the job description.

RULES:
- Keep the same achievement/metric/outcome — only adjust phrasing
- Do NOT fabricate new achievements, technologies, or metrics
- Do NOT change numbers, percentages, or dollar amounts
- Incorporate 1-3 relevant keywords per bullet where natural
- Maintain professional tone
- These skills should always be mentioned somewhere if relevant: ${alwaysIncludeSkills.join(", ")}

LENGTH RULES (critical for PDF formatting — one printed line is ~88 characters):
- Each bullet must be EITHER ≤88 characters (one line) OR 175-200 characters (two full lines)
- NEVER output bullets between 89-170 characters — this causes ugly wrapping with 1-2 dangling words
- If the original bullet is ≤88 chars, the tailored version MUST also be ≤88 chars
- If the original is >170 chars, aim for 175-200 chars (two clean lines)
- When in doubt, make it SHORTER. Concise and punchy is always better
- Total length across all bullets should be similar to or LESS than the original total
- Count your characters carefully for each bullet before returning

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
  const timeout = setTimeout(() => {
    console.log("[CV Tailor] Request timed out after 30s");
    controller.abort();
  }, 30000);

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
      throw new Error(`Request timed out after 30s (model: ${model}). Try a different model in settings.`);
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
