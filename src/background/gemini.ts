import {
  getProvider,
  getModel,
  getApiKey,
  getAnthropicApiKey,
  getAnthropicModel,
} from "../shared/storage";
import type { Provider } from "../shared/storage";

const GEMINI_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models";
const ANTHROPIC_BASE = "https://api.anthropic.com/v1/messages";

export interface TailoredBullet {
  id: string;
  tailoredText: string;
}

export interface TailoredSkills {
  label: string;
  tailoredItems: string;
}

export async function tailorBullets(
  jobDescription: string,
  bullets: { id: string; originalText: string }[],
  alwaysIncludeSkills: string[],
): Promise<TailoredBullet[]> {
  const bulletsWithLen = bullets.map((b) => ({
    id: b.id,
    text: b.originalText,
    chars: b.originalText.length,
  }));

  const prompt = `You are an expert resume tailoring assistant. Maximize keyword overlap between resume bullets and the job description while keeping bullets SHORT.

STEP 1 — EXTRACT ALL JD KEYWORDS in these categories:
- Hard skills: languages, frameworks, databases, tools (e.g., Java, Spring Boot, MySQL, BitBucket)
- Process keywords: methodologies, practices (e.g., testing, code review, documentation, Agile, CI/CD)
- Domain keywords: industry terms, concepts (e.g., microservices, REST APIs, data pipelines)

STEP 2 — REWRITE EACH BULLET to incorporate JD keywords:

KEYWORD INTEGRATION RULES:
- Integrate the JD's most important required skills across the bullets. Not every bullet needs to change — prioritize bullets where a natural tech swap or keyword fit exists.
- Leave a bullet unchanged if it already showcases strong achievements and there's no natural way to integrate JD keywords without diluting the content.
- Each modified bullet should contain 1-3 JD keywords from ANY category (hard skills, process, domain)
- You MAY swap similar technologies when the underlying work is equivalent:
  PostgreSQL→MySQL, Express.js→Spring Boot, GitHub→BitBucket, any DB→the JD's DB, etc.
- When swapping tech, swap to the SAME specificity level. Don't replace "React/TypeScript" with just "JavaScript" — use "React with JavaScript" or keep the original. Generic terms are LESS impressive than specific ones.
- You MAY add brief process context ONLY if it fits naturally and doesn't bloat the bullet
- Process keywords (testing, code reviews, Agile) must be CAUSALLY related to the action. "Reducing latency via code reviews" is WRONG — code reviews don't reduce latency. Instead: "Built X with unit testing and code reviews" is correct.
- Distribute JD keywords across modified bullets — don't cluster the same keyword in every one
- These skills should appear across bullets if relevant: ${alwaysIncludeSkills.join(", ")}

WRITING QUALITY RULES (critical):
- NEVER use em dashes (—) or en dashes (–). Use regular hyphens (-) or commas instead. Em dashes signal LLM-generated text.
- NEVER repeat the same sentence structure or connective pattern across bullets. E.g., if one bullet ends with "- saving X", don't end another with "- saved Y".
- NEVER repeat the same adjective or filler word across bullets
- Vary sentence openings — don't start every bullet with the same pattern
- PRESERVE specific technical details from the original (deployment targets, infrastructure, cloud providers, specific tools like python-pptx, AWS SES, etc.). Only swap a technology for its JD-equivalent — keep everything else.
- Do NOT replace specific tech (e.g., "Google Cloud Run", "AWS S3", "Gemini API") with vague terms (e.g., "cloud", "API integration"). Keep the original specifics unless swapping for a JD equivalent.
- Do NOT pad bullets with filler phrases like "documented for n-tier architecture" or "featuring optimized rendering". Keep it tight.
- Weave JD keywords NATURALLY into the sentence — don't just append "within Agile" or similar
- Maintain logical cause-and-effect: JD keywords should describe HOW the work was done, not be tacked onto unrelated outcomes. E.g., "reducing latency through Git" is wrong — Git doesn't reduce latency.
- Keep the SAME achievement/metric/outcome — do NOT drop metrics, numbers, or dollar amounts
- Do NOT fabricate new achievements or metrics. Do NOT change numbers, percentages, or dollar amounts.

LENGTH RULES (one printed line ≈ 88 characters):
- STRONGLY prefer ≤88 characters (1 line). At least 4 out of every 6 bullets MUST be ≤88 chars.
- Only go to 2 lines (160-176 chars) for bullets that have genuinely dense technical content AND critical JD keywords that can't fit in 88 chars.
- If the original bullet was 1 line, the tailored version should also be 1 line unless absolutely necessary.
- NEVER output 89-159 characters — causes ugly wrapping. Either ≤88 or 160-176.
- NEVER exceed 176 characters.
- Count characters carefully for every bullet before returning.

JOB DESCRIPTION:
${jobDescription}

RESUME BULLETS (with character counts):
${JSON.stringify(bulletsWithLen)}

Return ONLY a JSON array, no markdown fences: [{"id": "...", "tailoredText": "..."}]`;

  const result = await callLLM(prompt);
  return parseBulletResponse(result);
}

export async function tailorSkills(
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

Return ONLY a JSON array, no markdown fences: [{"label": "...", "tailoredItems": "..."}]`;

  const result = await callLLM(prompt);
  const parsed = JSON.parse(extractJSON(result)) as Record<string, unknown>[];
  return parsed.map((item) => ({
    label: String(item.label ?? item.category ?? ""),
    tailoredItems: String(item.tailoredItems ?? item.items ?? ""),
  }));
}

/** Extract JSON array from LLM response text (handles markdown fences, surrounding text) */
function extractJSON(text: string): string {
  // Try direct parse first
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return text;
  } catch {}

  // Strip markdown fences
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) {
    try {
      const parsed = JSON.parse(fenceMatch[1]);
      if (Array.isArray(parsed)) return fenceMatch[1];
    } catch {}
  }

  // Find first [ ... last ]
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start !== -1 && end > start) {
    const slice = text.slice(start, end + 1);
    try {
      JSON.parse(slice);
      return slice;
    } catch {}
  }

  console.log("[CV Tailor] Could not extract JSON from:", text.slice(0, 300));
  throw new Error("Failed to extract JSON from LLM response");
}

/** Parse and validate bullet response — handles key name variations */
function parseBulletResponse(raw: string): TailoredBullet[] {
  const parsed = JSON.parse(extractJSON(raw)) as Record<string, unknown>[];
  if (!Array.isArray(parsed)) throw new Error("Expected JSON array from LLM");

  return parsed.map((item) => {
    const id = String(item.id ?? "");
    // Handle common key variations: tailoredText, tailored_text, text, bullet, content
    const text = item.tailoredText ?? item.tailored_text ?? item.text ?? item.bullet ?? item.content;
    if (!id || !text) {
      console.log("[CV Tailor] Malformed bullet item:", JSON.stringify(item).slice(0, 200));
    }
    return { id, tailoredText: String(text ?? "") };
  });
}

/** Dispatch to Gemini or Anthropic based on provider setting */
async function callLLM(prompt: string): Promise<string> {
  const provider = await getProvider();
  if (provider === "anthropic") {
    const apiKey = await getAnthropicApiKey();
    if (!apiKey) throw new Error("No Anthropic API key configured");
    const model = await getAnthropicModel();
    return callAnthropic(apiKey, model, prompt);
  }
  const apiKey = await getApiKey();
  if (!apiKey) throw new Error("No Gemini API key configured");
  const model = await getModel();
  return callGemini(apiKey, model, prompt);
}

async function callGemini(apiKey: string, model: string, prompt: string): Promise<string> {
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

async function callAnthropic(apiKey: string, model: string, prompt: string): Promise<string> {
  console.log(`[CV Tailor] Calling Anthropic model: ${model}`);

  const controller = new AbortController();
  const timeoutMs = 60000;
  const timeout = setTimeout(() => {
    console.log(`[CV Tailor] Request timed out after ${timeoutMs / 1000}s`);
    controller.abort();
  }, timeoutMs);

  try {
    const res = await fetch(ANTHROPIC_BASE, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        temperature: 0.5,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    clearTimeout(timeout);
    console.log(`[CV Tailor] Response status: ${res.status}`);

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Anthropic API error (${res.status}): ${err}`);
    }

    const data = await res.json();
    const text = data.content?.[0]?.text;
    if (!text) {
      console.log("[CV Tailor] Response data:", JSON.stringify(data).slice(0, 500));
      throw new Error("Empty response from Anthropic");
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
  bullets: TailoredBullet[],
  maxLen: number,
): Promise<TailoredBullet[]> {
  const prompt = `Shorten each bullet to ≤${maxLen} characters. Keep all JD keywords and metrics. Cut filler words, combine clauses, use shorter synonyms. Do NOT remove technical terms or numbers.

BULLETS:
${JSON.stringify(bullets.map((b) => ({ id: b.id, text: b.tailoredText, chars: b.tailoredText.length })))}

Return ONLY a JSON array, no markdown fences: [{"id": "...", "tailoredText": "..."}]`;

  const result = await callLLM(prompt);
  return parseBulletResponse(result);
}

export async function testApiKey(apiKey: string, provider: Provider): Promise<{ valid: boolean; error?: string }> {
  try {
    const prompt = 'Respond with exactly this JSON, nothing else: {"ok": true}';
    let result: string;
    if (provider === "anthropic") {
      const model = await getAnthropicModel();
      result = await callAnthropic(apiKey, model, prompt);
    } else {
      const model = await getModel();
      result = await callGemini(apiKey, model, prompt);
    }
    // Find {"ok": true} anywhere in response
    const match = result.match(/\{\s*"ok"\s*:\s*true\s*\}/);
    return { valid: !!match };
  } catch (err) {
    return { valid: false, error: err instanceof Error ? err.message : String(err) };
  }
}
