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

  const prompt = `STEP 1 — HIRING MANAGER CRITIQUE:
You are ${roleCtx}. Review this candidate's resume bullets against the job description below. Be specific:
- What's strong? Which bullets already align well with what you need?
- What's missing? Which JD requirements have no coverage?
- What feels irrelevant or would you skip reading?
- What would you want to see more of?

STEP 2 — TAILOR BASED ON YOUR CRITIQUE:
Now rewrite the bullets to address the gaps you identified. Use JD language where the underlying work supports it.

KEYWORD INTEGRATION RULES:
- Maximize keyword coverage where the underlying work SUPPORTS it. Every bullet should use JD language where the original work naturally maps, but don't force keywords into bullets where the connection is a stretch. A bullet can stay lightly modified if the remaining JD keywords don't genuinely relate to that work.
- REFRAME the work to match JD language. E.g., if JD says "data pipelines" and bullet describes a reporting pipeline, call it a "data pipeline". If JD says "quality control workflows" and bullet describes QA validation, call it a "quality control workflow".
- Swap technologies for JD equivalents ONLY within the same category: DB→DB (PostgreSQL→MySQL), VCS→VCS (GitHub→BitBucket), web framework→web framework (Express→Spring Boot).
- NEVER swap across categories (e.g., React→C++, Express.js→embedded). If the JD domain differs from the work, reframe the CONCEPTS and outcomes, not the tech stack.
- Keep the same specificity level. Don't replace "React/TypeScript" with just "JavaScript".
- Use JD domain language to DESCRIBE existing work. If JD mentions "JSON transformation", "admin dashboards", "bulk operations", "workflow management", "serverless" — reword bullets to use those exact phrases where the underlying work supports it.
- You MAY add brief process context ONLY if it fits naturally and doesn't bloat the bullet
- Process keywords (testing, code reviews, Agile) must be CAUSALLY related to the action. "Reducing latency via code reviews" is WRONG — code reviews don't reduce latency. Instead: "Built X with unit testing and code reviews" is correct.
- Distribute JD keywords across modified bullets — don't cluster the same keyword in every one
- Candidate's signature skills: ${alwaysIncludeSkills.join(", ")}. Include ONLY when relevant to the JD domain. If a skill doesn't appear in or relate to the JD (e.g., Spring Boot for an embedded role, Next.js for a systems role), do NOT mention it at all. JD-specific keywords ALWAYS take absolute priority over this list.

TRANSFERABLE SKILLS (when JD domain differs from experience):
- When the JD domain differs (e.g., embedded JD vs web experience), highlight transferable CONCEPTS: performance optimization, debugging, system design, data pipelines, testing methodology.
- Emphasize aspects of existing work that align with JD values, but keep the original tech stack honest. If the work used Python and Express.js, say so — don't pretend it was C++.
- You MAY add "on Linux" to deployment/infra bullets when the work plausibly ran on Linux (cloud, Docker, servers).
- The candidate's SKILLS section lists what they actually know. If a JD skill appears in the candidate's skills (e.g., C++, Linux), ACTIVELY weave it into bullets where the work context supports it — these are real skills, not fabrications. Prioritize JD skills the candidate actually knows over generic reframing.

EMBEDDED / SYSTEMS / LOW-LEVEL ROLE MAPPING (use when JD mentions embedded, RTOS, firmware, QEMU, kernel, hardware, drivers, or similar):
- These roles value FUNDAMENTALS over frameworks. Emphasize: C/C++, Linux, debugging, performance optimization, memory management, system architecture. Do NOT mention web frameworks (React, Express, Spring Boot, Next.js) unless the original bullet's core work is inseparable from them.
- If the candidate's skills include C++, Linux, or other JD-relevant systems skills, weave them prominently. These are real skills — treat them as primary, not secondary.
- Highlight transferable concepts WITHOUT faking the tech:
  "optimized API latency" → "optimized system performance", "deployed to cloud" → "deployed on Linux",
  "CI/CD pipeline" → "build and validation pipeline", "load testing" → "system validation and stress testing"
- Do NOT map web concepts to hardware-specific terms the candidate didn't use. Specifically:
  Do NOT add "serial communication", "UART", "I2C", "SPI", "memory-mapped I/O", "circular buffer", "RTOS", "board support" unless the original bullet already describes that kind of work.
  "WebSocket" is NOT "serial communication". "Docker" is NOT "QEMU virtualization". "JSON parsing" is NOT "data serialization protocol". These are different technologies.
- INTERVIEW TEST: For every bullet, ask "Could the candidate explain this in a 2-minute interview answer without lying?" If no, you've gone too far. Pull back to what actually happened, described in JD-friendly language.

WRITING QUALITY RULES (critical):
- NEVER use em dashes (—) or en dashes (–). Use regular hyphens (-) or commas instead. Em dashes signal LLM-generated text.
- NEVER repeat the same sentence structure or connective pattern across bullets. E.g., if one bullet ends with "- saving X", don't end another with "- saved Y".
- NEVER repeat the same adjective or filler word across bullets
- Use a UNIQUE action verb for each bullet. NEVER repeat the same leading verb across bullets. Rotate through: built, engineered, developed, implemented, designed, automated, optimized, deployed, integrated, delivered, architected, streamlined, established, reduced, migrated, created, accelerated. If you've used "built" once, do NOT use it again.
- PRESERVE specific technical details from the original (deployment targets, infrastructure, cloud providers, specific tools like python-pptx, AWS SES, etc.). Only swap a technology for its JD-equivalent — keep everything else.
- Do NOT replace specific tech (e.g., "Google Cloud Run", "AWS S3", "Gemini API") with vague terms (e.g., "cloud", "API integration"). Keep the original specifics unless swapping for a JD equivalent.
- Do NOT pad bullets with filler phrases like "documented for n-tier architecture" or "featuring optimized rendering". Keep it tight.
- Weave JD keywords NATURALLY into the sentence — don't just append "within Agile" or similar
- Maintain logical cause-and-effect: JD keywords should describe HOW the work was done, not be tacked onto unrelated outcomes. E.g., "reducing latency through Git" is wrong — Git doesn't reduce latency.
- Keep the SAME achievement/metric/outcome — do NOT drop metrics, numbers, or dollar amounts
- Do NOT fabricate new achievements or metrics. Do NOT change numbers, percentages, or dollar amounts.

LENGTH RULES (one printed line ≈ 88 characters):
- Single-line bullets MUST be 80-88 characters. Bullets under 80 chars look sparse and waste space — add relevant technical detail to fill the line.
- At least 4 out of every 6 bullets MUST be single-line (80-88 chars).
- Only go to 2 lines (160-176 chars) for bullets with genuinely dense technical content AND critical JD keywords that can't fit in 88 chars.
- If the original bullet was 1 line, the tailored version should also be 1 line unless absolutely necessary.
- NEVER output 89-159 characters — causes ugly wrapping. Either 80-88 or 160-176.
- NEVER output under 80 characters — looks sparse. Add JD keywords or technical context to fill the line.
- NEVER exceed 176 characters.
- Count characters carefully for every bullet before returning.

CANDIDATE'S SKILLS (safe to reference in bullets):
${candidateSkills || "Not provided"}

${customInstructions ? `USER INSTRUCTIONS (MUST follow these exactly):\n${customInstructions}\n\n` : ""}JOB DESCRIPTION:
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
        temperature: 0.7,
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

export async function expandBullets(
  bullets: TailoredBullet[],
  minLen: number,
  maxLen: number,
): Promise<TailoredBullet[]> {
  const prompt = `Expand each bullet to ${minLen}-${maxLen} characters. Add relevant technical detail or context. Do NOT go below ${minLen} or above ${maxLen} characters.

BULLETS:
${JSON.stringify(bullets.map((b) => ({ id: b.id, text: b.tailoredText, chars: b.tailoredText.length })))}

Return ONLY a JSON array, no markdown fences: [{"id": "...", "tailoredText": "..."}]`;

  const result = await callLLM(prompt);
  return parseBulletResponse(result);
}

export async function refineBullets(
  jobDescription: string,
  originalBullets: { id: string; originalText: string }[],
  tailoredBullets: TailoredBullet[],
  candidateSkills: string = "",
  customInstructions: string = "",
  jobTitle: string = "",
  company: string = "",
): Promise<TailoredBullet[]> {
  const origMap = Object.fromEntries(originalBullets.map((b) => [b.id, b.originalText]));
  const bullets = tailoredBullets.map((b) => ({
    id: b.id,
    original: origMap[b.id] ?? "",
    tailored: b.tailoredText,
    chars: b.tailoredText.length,
  }));

  const roleCtx = jobTitle && company
    ? `a hiring manager at ${company} reviewing these bullets for "${jobTitle}"`
    : jobTitle
      ? `a hiring manager reviewing these bullets for "${jobTitle}"`
      : company
        ? `a hiring manager at ${company} reviewing these bullets`
        : `a hiring manager reviewing these bullets`;

  const prompt = `You are ${roleCtx}. These bullets were already tailored to match the job description. Your job is to improve them further. Only rewrite bullets that have issues — pass through good ones unchanged.

CRITICAL CONTEXT: The tailored bullets were reframed to match JD language. The "original" field is provided so you can check for fabricated metrics AND detect over-fitting (bullets that claim technologies or activities the original work didn't involve).

${customInstructions ? `USER INSTRUCTIONS (MUST follow): ${customInstructions}\n\n` : ""}JOB DESCRIPTION:
${jobDescription}

CANDIDATE'S SKILLS (safe to reference): ${candidateSkills || "Not provided"}

TAILORED BULLETS (with originals for metric verification only):
${JSON.stringify(bullets)}

CHECK EACH BULLET FOR THESE ISSUES AND FIX:

1. OVER-FITTING / CREDIBILITY CHECK (most important):
   - Compare each tailored bullet to its original. If the tailored version claims hardware-specific terms (serial communication, memory-mapped I/O, UART, circular buffer, RTOS, board support) that the original doesn't support, REWRITE it to use honest language.
   - INTERVIEW TEST: could the candidate explain this bullet in 2 minutes without lying? If not, pull back.
   - It's fine to use JD vocabulary for genuine concepts (e.g., "optimized performance" instead of "reduced latency"). It's NOT fine to invent technologies (e.g., "RS-232 serial protocol" when original was "REST API").
   - Keep the original tech stack honest. If the work used Python/Express.js, say so — describe the OUTCOMES in JD-friendly terms instead.

2. LENGTH VIOLATIONS:
   - Under 80 chars → too sparse, add relevant JD keywords or technical detail to reach 80-88
   - 89-159 chars → dead zone, either cut to 80-88 or expand to 160-176
   - Over 176 chars → too long, cut to ≤176
   - Target: 80-88 chars for 1-line bullets, 160-176 for 2-line bullets

3. KEYWORD GAPS: List all major JD keywords. Check which ones appear across the bullet set. If important JD keywords are completely missing, weave them into the weakest bullets.

4. FABRICATED METRICS: If the tailored version has a number/metric (%, $, hours) that does NOT appear in the original, REMOVE that metric. Adding plausible technical context (tools, methods, systems language) is fine — only fabricated NUMBERS are not allowed.

5. VERB REPETITION (critical): Check ALL bullet leading verbs. If ANY two bullets start with the same verb (e.g., two "Built..." or two "Developed..."), rewrite one to use a different verb. Every bullet must have a unique opening verb.

RULES:
- If a bullet is honest AND uses JD-friendly language AND has no issues, return it EXACTLY as-is
- Keep all real metrics/numbers from originals intact
- NEVER use em dashes or en dashes
- Revert fabricated technical claims back to honest descriptions using JD-friendly vocabulary
- Output must follow length rules strictly: 80-88 or 160-176 chars per bullet

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
