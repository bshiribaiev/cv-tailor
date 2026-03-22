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
  candidateSkills: string = "",
  customInstructions: string = "",
  jobTitle: string = "",
  company: string = "",
): Promise<TailoredBullet[]> {
  const bulletsWithLen = bullets.map((b) => ({
    id: b.id,
    text: b.originalText,
    chars: b.originalText.length,
  }));

  // Derive hiring manager persona from JD
  const jdLower = jobDescription.toLowerCase();
  const persona = jdLower.includes("senior engineer") || jdLower.includes("sr. engineer") || jdLower.includes("staff engineer")
    ? "senior engineer"
    : jdLower.includes("team lead") || jdLower.includes("tech lead")
      ? "engineering team lead"
      : "engineering manager";

  const roleCtx = jobTitle && company
    ? `a ${persona} at ${company} hiring for "${jobTitle}"`
    : jobTitle
      ? `a ${persona} hiring for "${jobTitle}"`
      : company
        ? `a ${persona} at ${company}`
        : `a ${persona}`;

  const prompt = `You are ${roleCtx}. Tailor these resume bullets to match the job description.

PROCESS:
1. Classify the JD domain (web, systems, robotics, ML, quant, embedded, infra, etc.)
2. Extract JD vocabulary: every technology, tool, domain term, and concept
3. For each JD tech the candidate knows (from skills or originals), assign it to exactly ONE bullet
4. Rewrite bullets using JD vocabulary to describe the candidate's EXISTING work

RULES (in priority order):

1. NO FABRICATION: Same work, same complexity. Never invent details not in the original (data structures, protocols, metrics, domain context). Never change programming languages (Java stays Java, Python stays Python). If original language is irrelevant to JD, drop it entirely rather than swap.

2. DOMAIN SUPPRESSION: If JD is non-web (robotics, embedded, systems, ML, quant, infra), remove ALL web-specific terms: Spring Boot, Express.js, React, Next.js, Node.js, JavaScript, TypeScript, PostgreSQL, REST API, "load balancer", "lead conversion", "messaging system", "search interface", "web scraper". Reframe around the transferable skill:
   - "Express.js backend with PostgreSQL" → "data processing service with structured storage"
   - "load balancer reducing latency" → "performance-optimized service reducing latency"
   - "TypeScript search interface" → "data filtering and retrieval interface"
   - "lead conversion by 30%" → "throughput by 30%"
   A hiring manager sees "PostgreSQL load balancer" on a robotics resume and knows you bulk-applied.

3. NO COPY-PASTE: Never use 4+ consecutive words from the JD. The hiring manager wrote it and will recognize their own phrasing. JD says "Develop testing approaches to validate improvements" → NEVER write "Developed testing approaches to validate..." → write "Built automated validation framework improving accuracy by 30%".

4. TECH DEDUP: Each tech name appears in exactly ONE bullet across all jobs. Each noun phrase appears at most once.

5. NO EM DASHES (— or –) anywhere. Use commas or semicolons.

6. UNIQUE VERBS: Every bullet starts with a different action verb. No duplicates.

7. SENTENCE VARIETY: Within each job's 3 bullets, vary structure and endings. If one ends with a metric ("reducing X by Y%"), the next must end differently. No two bullets should feel structurally similar.

8. SKILL COVERAGE: Every JD tech the candidate knows must appear in at least one bullet. Only use tech from: JD, candidate's skills, or original bullets.

9. METRICS: Preserve all original numbers/percentages exactly. Never fabricate metrics. When reframing domain, neutralize metrics that don't fit ("lead conversion" in robotics → "processing efficiency").

LENGTH (LaTeX template, 1 line ≈ 105 chars):
- Target: 90-105 chars (single line). Max 1 bullet per job may be 180-210 chars (two lines).
- FORBIDDEN zone: 106-179 chars (ugly wrapping). Either cut to 90-105 or expand to 180-210.
- Never under 90 or over 210 chars.

CANDIDATE'S SKILLS: ${candidateSkills || "Not provided"}
ALWAYS-INCLUDE SKILLS (only if JD-relevant): ${alwaysIncludeSkills.join(", ")}

${customInstructions ? `USER INSTRUCTIONS: ${customInstructions}\n\n` : ""}JOB DESCRIPTION:
${jobDescription}

RESUME BULLETS:
${JSON.stringify(bulletsWithLen)}

Return ONLY JSON (no markdown fences):
{
  "techAllocation": {"Python": "exp-1-2", "C++": "exp-2-3", ...},
  "techFrequency": {"Python": 1, "C++": 1, ...},
  "bullets": [{"id": "...", "tailoredText": "..."}]
}
techFrequency: count of each tech across ALL bullets. Every value MUST be 1.`;

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
- May drop skills irrelevant to the JD to stay within line length, but NEVER drop always-include skills
- These must always appear: ${alwaysIncludeSkills.join(", ")}
- If JD requires system-level skills (Linux, Unix, Bash, etc.), ADD them to the appropriate category
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

/** Extract JSON (array or object) from LLM response text (handles markdown fences, surrounding text) */
function extractJSON(text: string): string {
  // Try direct parse first (accept arrays or objects)
  try {
    const parsed = JSON.parse(text);
    if (parsed !== null && typeof parsed === "object") return text;
  } catch {}

  // Strip markdown fences
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) {
    try {
      const parsed = JSON.parse(fenceMatch[1]);
      if (parsed !== null && typeof parsed === "object") return fenceMatch[1];
    } catch {}
  }

  // Find first [ ... last ]
  const arrStart = text.indexOf("[");
  const arrEnd = text.lastIndexOf("]");
  if (arrStart !== -1 && arrEnd > arrStart) {
    const slice = text.slice(arrStart, arrEnd + 1);
    try {
      JSON.parse(slice);
      return slice;
    } catch {}
  }

  // Find first { ... last }
  const objStart = text.indexOf("{");
  const objEnd = text.lastIndexOf("}");
  if (objStart !== -1 && objEnd > objStart) {
    const slice = text.slice(objStart, objEnd + 1);
    try {
      JSON.parse(slice);
      return slice;
    } catch {}
  }

  console.log("[CV Tailor] Could not extract JSON from:", text.slice(0, 300));
  throw new Error("Failed to extract JSON from LLM response");
}

/** Parse and validate bullet response — handles key name variations and wrapped format */
function parseBulletResponse(raw: string): TailoredBullet[] {
  let parsed: unknown = JSON.parse(extractJSON(raw));

  // Handle wrapped format: {"techAllocation": ..., "techFrequency": ..., "bullets": [...]}
  if (!Array.isArray(parsed) && typeof parsed === "object" && parsed !== null) {
    const obj = parsed as Record<string, unknown>;
    if (obj.techFrequency) {
      console.log("[CV Tailor] Tech frequency from LLM:", JSON.stringify(obj.techFrequency));
    }
    if (Array.isArray(obj.bullets)) {
      parsed = obj.bullets;
    }
  }

  if (!Array.isArray(parsed)) throw new Error("Expected JSON array from LLM");

  return (parsed as Record<string, unknown>[]).map((item) => {
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
          temperature: 0.7,
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
        temperature: 0.2,
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
