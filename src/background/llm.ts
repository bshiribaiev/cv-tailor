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

  const prompt = `STEP 1 — JD VOCABULARY EXTRACTION:
List EVERY technology, language, platform, tool, domain term, and concept from the job description. This is the "JD vocabulary" — these exact words must appear in your tailored bullets.

STEP 2 — HIRING MANAGER CRITIQUE:
You are ${roleCtx}. Review the candidate's resume bullets against the JD:
- Which bullets already align with what you need?
- Which JD requirements have zero coverage?
- Which technologies feel irrelevant to this role?
- Which JD vocabulary terms are absent but could naturally describe the candidate's existing work?

STEP 3 — TAILOR BASED ON YOUR CRITIQUE:
Rewrite the bullets to address the gaps. Use JD vocabulary where the underlying work supports it.

KEYWORD INTEGRATION RULES:
- Maximize keyword coverage where the underlying work SUPPORTS it. Every bullet should use JD language where the original work naturally maps, but don't force keywords into bullets where the connection is a stretch. A bullet can stay lightly modified if the remaining JD keywords don't genuinely relate to that work.
- REFRAME using JD's EXACT noun phrases — not looser synonyms. "reporting pipeline" → "data pipeline" when JD says "data pipelines". "cloud deployment" → "deployed on Linux" when JD requires Linux. "reduced latency" → "low-latency" when JD says "low-latency". Always use the JD's specific term, never a vaguer paraphrase.
- Swap technologies for JD equivalents ONLY within the same category: DB→DB (PostgreSQL→MySQL), VCS→VCS (GitHub→BitBucket), web framework→web framework (Express→Spring Boot).
- NEVER swap tech 1:1 across categories (e.g., React→C++, Express.js→embedded). But DO drop irrelevant tech entirely and reframe the CONCEPTS and outcomes using JD vocabulary.
- ANTI-GENERICIZATION: Every removed tech MUST be replaced with a JD-relevant term — never leave a void. "Built backend with Express.js" for a systems JD → "Built low-latency data service on Linux", NOT "Built backend system". If a bullet becomes vaguer than the original after tailoring, add JD terms until specificity matches or exceeds the original.
- Keep the same specificity level. Don't replace "React/TypeScript" with just "JavaScript".
- Use JD domain language to DESCRIBE existing work. If JD mentions "JSON transformation", "admin dashboards", "bulk operations", "workflow management", "serverless" — reword bullets to use those exact phrases where the underlying work supports it.
- You MAY add brief process context ONLY if it fits naturally and doesn't bloat the bullet
- Process keywords (testing, code reviews, Agile) must be CAUSALLY related to the action. "Reducing latency via code reviews" is WRONG — code reviews don't reduce latency. Instead: "Built X with unit testing and code reviews" is correct.
- Distribute JD keywords across modified bullets — don't cluster the same keyword in every one
- Candidate's signature skills: ${alwaysIncludeSkills.join(", ")}. This list is FULLY OVERRIDDEN by tech relevance: if a skill doesn't appear in or relate to the JD, do NOT mention it at all. Spring Boot, Next.js, Express.js, React, Node.js — drop ALL of these for non-web JDs. JD-specific keywords ALWAYS take absolute priority.

TECH RELEVANCE & REFRAMING (apply to EVERY bullet, for ANY JD):
- Step 1: Extract JD's tech stack and domain vocabulary. List every technology, framework, concept, and skill the JD mentions. This is the "relevant set." Also list the JD's DOMAIN-SPECIFIC phrases (e.g., "machine learning", "deep learning", "optimization algorithms", "data pipelines", "embedded systems") — these are the words you MUST use in bullets, not generic synonyms.
- Step 2: For every tech in each bullet, check: does it appear in the JD OR directly support something in the JD? If NO, DROP it. Replace with either (a) a JD technology the candidate actually knows (from their skills section), or (b) a JD domain phrase that describes the same concept. NEVER replace with generic terms like "workflow optimization" or "backend system" when the JD has specific vocabulary available.
- Step 3: Reframe using JD's EXACT domain phrases, not watered-down versions. If JD says "machine learning", write "machine learning", not "intelligent workflow". If JD says "optimization algorithms", write "optimization algorithms", not "workflow optimization". Match the JD's specificity level.
- Concrete examples of suppress & reframe:
  JD says "data pipelines" + bullet describes "SEO reporting pipeline" → call it "data pipeline", NOT just "pipeline"
  JD requires "Linux" + bullet mentions cloud deployment → add "on Linux": "deployed on Linux with cron scheduling"
  JD says "low-latency" + bullet mentions "reducing API latency" → say "low-latency" explicitly
  JD says "systems programming" + bullet describes backend work → reframe as "systems-level"
  JD says "optimization algorithms" + bullet mentions "Express.js backend" → drop Express.js, say "optimization algorithm"
  JD says "machine learning" + bullet mentions "React search UI" → drop React, say "ML-driven search"
  JD says "embedded systems" + bullet mentions "Spring Boot microservice" → drop Spring Boot, say "modular system architecture"
  General pattern: drop irrelevant tech, USE THE JD'S EXACT DOMAIN TERMS, not generic descriptions
- CANDIDATE SKILL WEAVING (critical — verify before returning): Cross-reference JD-required technologies against the candidate's SKILLS section. For EACH match (tech in both JD and candidate skills), it MUST appear in at least one bullet. Non-negotiable. E.g., candidate knows C++ and JD requires C++ → use C++ in a bullet. Candidate knows Python and JD lists Python → Python must appear. JD requires Linux and candidate has cloud/infra experience → add "on Linux". Candidate knows PyTorch and JD wants ML → weave PyTorch in. After drafting all bullets, CHECK: is every JD+candidate skill match represented? If any is missing, revise now.
- Do NOT inject technologies that appear in NEITHER the JD NOR the candidate's skills section. Only use tech from the JD's relevant set or the candidate's known skills. E.g., don't add Selenium, Kafka, or Redis if they're not in the JD and the candidate doesn't list them.
- DEDUP (strictly enforced):
  - Each technology name may appear in AT MOST ONE bullet across the entire set. If Python appears in 3 originals, pick the strongest bullet for Python and describe the others via outcomes or different tech.
  - Each noun phrase (e.g., "data pipeline", "optimization") may appear AT MOST ONCE. Use the JD's full vocabulary — if JD says "machine learning", "deep learning", "optimization", "GPU", "AI" — that's 5 different phrases to distribute, not 1 repeated 5 times.
  - Before returning, scan all bullets and count occurrences of every tech name and noun phrase. If any appears more than once, rewrite to fix.

FINAL VERIFICATION (mandatory before outputting JSON):
1. List every JD-required tech the candidate also knows. Does EACH appear in at least one bullet? If not, fix now.
2. Does every bullet have at least one JD keyword or domain term? If not, add one.
3. Is any bullet more generic than its original (lost tech names without gaining JD terms)? If yes, add JD vocabulary.
4. For non-web JDs: do any bullets still contain React, Express, Spring Boot, Next.js, or Node.js? If yes, suppress and reframe.

BULLET STRUCTURE (Google XYZ format — follow for EVERY bullet):
- Format: "Accomplished [X] as measured by [Y], by doing [Z]"
- X = what you did/built, Y = measurable result (metric, %, $, time saved), Z = how you did it (tools, methods, approach)
- Every bullet MUST have all three components. If the original bullet has a metric, preserve it as Y. If it doesn't, Y can be a qualitative outcome (e.g., "improving reliability", "enabling real-time updates").
- The X-Y-Z order can be flexible (Z-X-Y or X-Z-Y are fine) but all three parts must be present.
- Examples: "Reduced system latency from 300ms to 100ms by implementing load balancing and caching on Linux" (X=reduced latency, Y=300ms to 100ms, Z=load balancing and caching on Linux)

WRITING QUALITY RULES (critical):
- NEVER use em dashes (—) or en dashes (–). Use regular hyphens (-) or commas instead. Em dashes signal LLM-generated text.
- NEVER repeat the same sentence structure or connective pattern across bullets. E.g., if one bullet ends with "- saving X", don't end another with "- saved Y".
- NEVER repeat the same adjective or filler word across bullets
- Use a UNIQUE action verb for each bullet. NEVER repeat the same leading verb across bullets. Rotate through: built, engineered, developed, implemented, designed, automated, optimized, deployed, integrated, delivered, architected, streamlined, established, reduced, migrated, created, accelerated. If you've used "built" once, do NOT use it again.
- PRESERVE specific technical details that the hiring manager would care about (deployment targets, infrastructure, metrics). Drop tech names irrelevant to the JD domain — specificity matters only when it's relevant specificity.
- Do NOT replace JD-relevant specific tech with vague terms. But DO drop or generalize JD-irrelevant tech (e.g., for an embedded role, "Express.js REST APIs" → "service interface layer").
- Do NOT pad bullets with filler phrases like "documented for n-tier architecture" or "featuring optimized rendering". Keep it tight.
- Weave JD keywords NATURALLY into the sentence — don't just append "within Agile" or similar
- Maintain logical cause-and-effect: JD keywords should describe HOW the work was done, not be tacked onto unrelated outcomes. E.g., "reducing latency through Git" is wrong — Git doesn't reduce latency.
- Keep the SAME achievement/metric/outcome — do NOT drop metrics, numbers, or dollar amounts
- Do NOT fabricate new achievements or metrics. Do NOT change numbers, percentages, or dollar amounts.

LENGTH RULES (CRITICAL — one printed line ≈ 105 characters in this LaTeX template):
- DEFAULT is single-line: 90-105 characters. Every bullet should be single-line UNLESS you have a specific reason to go longer.
- MAXIMUM 1 bullet per job entry (3-bullet group) may be 2 lines (180-210 chars). The other 2 MUST be single-line. If all 3 fit in 90-105 chars, keep all 3 single-line.
- When a bullet exceeds 105 chars, DROP the least important detail to fit 90-105. Do NOT default to 2 lines. Prefer concise over comprehensive.
- NEVER output 106-179 characters — causes ugly wrapping. Either 90-105 or 180-210.
- NEVER output under 90 characters — looks sparse. Add JD keywords or technical context.
- NEVER exceed 210 characters. NEVER produce 3-line bullets.
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

1. WEB FRAMEWORK SUPPRESSION: If web-specific frameworks (React, Express, Spring Boot, Next.js, Node.js) remain in bullets but DON'T appear in the JD, suppress them and reframe using JD vocabulary. This overrides the always-include skills list.

2. INJECTED TECH CHECK: If any bullet contains a technology that appears in NEITHER the JD NOR the candidate's skills section (e.g., Selenium, Kafka, Redis added from nowhere), remove it and replace with JD-relevant tech or domain vocabulary.

3. LENGTH VIOLATIONS:
   - Under 90 chars → too sparse, add JD keywords or technical detail to reach 90-105
   - 106-179 chars → dead zone, either cut to 90-105 or expand to 180-210
   - Over 210 chars → too long, cut to ≤210. NEVER allow 3-line bullets.
   - Target: 90-105 chars for 1-line bullets (preferred), 180-210 for 2-line (max 1-2 per entry)

3. KEYWORD GAPS (highest priority): ENUMERATE every JD technology and domain term. For each, verify it appears in at least one bullet. Focus on: (a) JD programming languages the candidate knows — EACH must appear in a bullet, (b) JD platforms/OS (Linux, Unix) — must be mentioned if required, (c) JD domain phrases ("data pipelines", "low-latency", "systems programming") — if bullets use generic alternatives ("pipeline", "reduced latency", "backend"), swap to JD's exact phrases. If a JD-required language like C++ or Python is absent from all bullets despite the candidate knowing it, this is the #1 issue to fix.

4. TECH/PHRASE DEDUP: Scan all bullets for repeated technology names and noun phrases. If any tech name appears more than once (e.g., Python in 3 bullets), keep it in the strongest bullet and rewrite others using different tech or outcome-focused language. If any noun phrase repeats (e.g., "optimization" in 4 bullets), replace with different JD vocabulary.

5. FABRICATED METRICS: If the tailored version has a number/metric (%, $, hours) that does NOT appear in the original, REMOVE that metric. Adding plausible technical context (tools, methods, systems language) is fine — only fabricated NUMBERS are not allowed.

6. VERB REPETITION (critical): Check ALL bullet leading verbs. If ANY two bullets start with the same verb (e.g., two "Built..." or two "Developed..."), rewrite one to use a different verb. Every bullet must have a unique opening verb.

7. GENERIC REFRAMING: If any bullet uses vague terms ("workflow optimization", "intelligent workflow", "backend system") when the JD has specific domain vocabulary available (e.g., "machine learning", "optimization algorithms", "GPU-accelerated"), replace the generic term with the JD's exact phrase where the underlying work supports it.

8. GENERICIZATION CHECK: Compare each tailored bullet to its original. If the tailored version LOST specific tech names or details without replacing them with JD-equivalent terms, it's under-tailored. E.g., original had "Salesforce data with Pandas" → tailored says "data validation with Python" but JD mentions "data pipelines" → rewrite as "data pipeline validation with Python on Linux". Every removed detail must be backfilled with JD vocabulary.

RULES:
- If a bullet uses JD domain vocabulary AND has no issues above, return it EXACTLY as-is
- Keep all real metrics/numbers from originals intact
- NEVER use em dashes or en dashes
- Only use tech from the JD or the candidate's skills section — no injected tech from nowhere
- Output must follow length rules strictly: 90-105 or 180-210 chars per bullet

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
