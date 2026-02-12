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
): Promise<TailoredBullet[]> {
  const bulletsWithLen = bullets.map((b) => ({
    id: b.id,
    text: b.originalText,
    chars: b.originalText.length,
  }));

  const prompt = `You are an expert resume tailoring assistant. Maximize keyword overlap between resume bullets and the job description while keeping bullets SHORT.

STEP 1 — EXTRACT ALL JD KEYWORDS in these categories:
- Hard skills: languages, frameworks, databases, tools (e.g., Java, Spring Boot, MySQL, BitBucket, QEMU, GDB, Valgrind)
- Process keywords: methodologies, practices (e.g., testing, code review, documentation, Agile, CI/CD, debugging, validation)
- Domain keywords: industry terms, concepts (e.g., microservices, REST APIs, data pipelines, embedded systems, RTOS, virtualization, memory mapping, serial communication, board support packages)

STEP 2 — REWRITE EACH BULLET to incorporate JD keywords:

KEYWORD INTEGRATION RULES:
- BE AGGRESSIVE. Maximize TOTAL JD keyword coverage across all bullets. If important JD keywords are still missing after your first pass, go back and weave them into bullets that haven't been modified yet. A bullet can stay unchanged only if the remaining JD keywords genuinely don't fit it AND other bullets already cover them.
- REFRAME the work to match JD language. E.g., if JD says "data pipelines" and bullet describes a reporting pipeline, call it a "data pipeline". If JD says "quality control workflows" and bullet describes QA validation, call it a "quality control workflow".
- You MUST swap technologies for JD equivalents when the underlying work is similar:
  PostgreSQL→MySQL, Express.js→Spring Boot, GitHub→BitBucket, any DB→the JD's DB, etc.
- When swapping tech, swap to the SAME specificity level. Don't replace "React/TypeScript" with just "JavaScript" — use "React with JavaScript" or keep the original. Generic terms are LESS impressive than specific ones.
- Use JD domain language to DESCRIBE existing work. If JD mentions "JSON transformation", "admin dashboards", "bulk operations", "workflow management", "serverless" — reword bullets to use those exact phrases where the underlying work supports it.
- You MAY add brief process context ONLY if it fits naturally and doesn't bloat the bullet
- Process keywords (testing, code reviews, Agile) must be CAUSALLY related to the action. "Reducing latency via code reviews" is WRONG — code reviews don't reduce latency. Instead: "Built X with unit testing and code reviews" is correct.
- Distribute JD keywords across modified bullets — don't cluster the same keyword in every one
- These skills should appear across bullets if relevant, but JD-specific keywords take PRIORITY over these: ${alwaysIncludeSkills.join(", ")}

TRANSFERABLE SKILLS (when JD domain differs from experience):
- When the JD domain is different (e.g., embedded systems JD vs web dev experience), DON'T just give up. Reframe bullets using TRANSFERABLE CONCEPTS the JD values.
- Map experience concepts to JD language: "reduced API latency" → "debugged and optimized system performance", "deployed microservice" → "architected and deployed system on Linux", "data validation" → "validation and debugging pipeline", "automated pipeline" → "automated system pipeline on Linux".
- Emphasize aspects of the work that align with JD values. If JD values debugging, performance, system architecture, Linux, C/C++ — highlight those aspects of existing work even if the original bullet didn't emphasize them.
- You MAY shift tech emphasis: if original says "Express.js/PostgreSQL" but JD wants C/C++, swap to C++ if the candidate lists C++ in skills. Only swap to languages/tools the candidate actually knows (listed in their skills or other bullets).
- Add "on Linux" or "in Linux environment" to deployment/infra bullets when JD requires Linux and the work plausibly ran on Linux (cloud deployments, Docker, servers all run Linux).

EMBEDDED / SYSTEMS / LOW-LEVEL ROLE MAPPING (use when JD mentions embedded, RTOS, firmware, QEMU, kernel, hardware, drivers, or similar):
- These roles value FUNDAMENTALS over frameworks. Emphasize: C/C++, Linux, debugging, performance optimization, memory management, system architecture — de-emphasize web frameworks.
- Web→Systems concept mapping (use these when reframing):
  "API endpoint" → "system interface", "REST API" → "communication interface/protocol",
  "microservice" → "modular system component", "database queries" → "data access and memory operations",
  "backend server" → "system daemon/service on Linux", "JSON parsing" → "data serialization/deserialization",
  "WebSocket/streaming" → "serial/socket communication", "caching layer" → "memory-mapped data layer",
  "CI/CD pipeline" → "build and validation pipeline", "Docker container" → "virtualized environment",
  "latency optimization" → "system-level performance optimization", "load testing" → "system validation and stress testing"
- If JD mentions virtualization/QEMU/emulation: reframe any Docker/VM/container/cloud infra work toward virtualization concepts.
- If JD mentions serial/UART/I2C/SPI: reframe any socket/streaming/communication protocol work toward serial communication.
- If JD mentions memory mapping/layout: reframe any memory/caching/storage architecture work toward memory management.
- If JD mentions RTOS/VxWorks/FreeRTOS: reframe any concurrency/async/real-time processing work toward real-time system concepts.
- CREDIBILITY RULE: light fabrication is OK — adding plausible technical context that fits the work (e.g., adding "with memory-mapped I/O" to a data pipeline bullet, or "serial communication protocol" to a messaging system). But don't invent ENTIRELY unrelated activities (e.g., "wrote kernel module" when the original was "built landing page"). The candidate should be able to speak to the bullet in an interview.

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
): Promise<TailoredBullet[]> {
  const origMap = Object.fromEntries(originalBullets.map((b) => [b.id, b.originalText]));
  const bullets = tailoredBullets.map((b) => ({
    id: b.id,
    original: origMap[b.id] ?? "",
    tailored: b.tailoredText,
    chars: b.tailoredText.length,
  }));

  const prompt = `You are a resume bullet EDITOR. You receive bullets that were already tailored to match a job description. Your job is to improve them further. Only rewrite bullets that have issues — pass through good ones unchanged.

CRITICAL CONTEXT: The tailored bullets were INTENTIONALLY reframed from the candidate's original work to match JD language. The "original" field is provided ONLY so you can check for fabricated metrics. Do NOT revert bullets back toward the original wording. The JD is the target — bullets should sound like the JD, not like the original resume.

${customInstructions ? `USER INSTRUCTIONS (MUST follow): ${customInstructions}\n\n` : ""}JOB DESCRIPTION:
${jobDescription}

CANDIDATE'S SKILLS (safe to reference): ${candidateSkills || "Not provided"}

TAILORED BULLETS (with originals for metric verification only):
${JSON.stringify(bullets)}

CHECK EACH BULLET FOR THESE ISSUES AND FIX:

1. DOMAIN MISMATCH (tailor TOWARD JD, never away from it):
   - Identify the JD's domain (embedded/systems, web/cloud, data, etc.)
   - If a bullet contains technologies IRRELEVANT to the JD domain, reframe it using JD-appropriate language
   - Example: JD is embedded/systems → reframe "Spring Boot microservice" to "C/C++ system component on Linux", reframe "React/TypeScript UI" to "C++ interface with memory-optimized data structures"
   - NEVER revert a bullet that already uses JD-appropriate language back to web/cloud/original terminology
   - The candidate's original work domain does NOT matter — only the JD domain matters

2. LENGTH VIOLATIONS:
   - Under 80 chars → too sparse, add relevant JD keywords or technical detail to reach 80-88
   - 89-159 chars → dead zone, either cut to 80-88 or expand to 160-176
   - Over 176 chars → too long, cut to ≤176
   - Target: 80-88 chars for 1-line bullets, 160-176 for 2-line bullets

3. KEYWORD GAPS: List all major JD keywords. Check which ones appear across the bullet set. If important JD keywords are completely missing, weave them into the weakest bullets.

4. FABRICATED METRICS: If the tailored version has a number/metric (%, $, hours) that does NOT appear in the original, REMOVE that metric. Adding plausible technical context (tools, methods, systems language) is fine — only fabricated NUMBERS are not allowed.

5. REPETITION: If multiple bullets start with the same verb or use the same sentence structure, vary them.

RULES:
- If a bullet already matches JD domain and has no issues, return it EXACTLY as-is
- Keep all real metrics/numbers from originals intact
- NEVER use em dashes or en dashes
- NEVER revert JD-targeted language back to original/generic language
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
