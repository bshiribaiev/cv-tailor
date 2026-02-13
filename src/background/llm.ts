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

STEP 2.5 — TECH ALLOCATION PLAN (mandatory before writing ANY bullet):
Assign each JD-relevant technology the candidate knows to EXACTLY ONE bullet ID. This is a binding contract — each tech appears ONLY in its assigned bullet, nowhere else.
Example allocation:
  Python → exp-1-2
  C++ → exp-2-3
  Java → exp-2-1
  Linux → exp-1-1
  SQL → exp-1-3
Rules: No bullet gets more than 2-3 tech names. Every JD+candidate tech match gets assigned. If a tech appeared in 3 original bullets, pick the ONE where it fits best. The other bullets must use DIFFERENT tech from the allocation.

STEP 3 — TAILOR BASED ON YOUR CRITIQUE AND ALLOCATION:
Rewrite the bullets to address the gaps. Use JD vocabulary where the underlying work supports it. STRICTLY follow the tech allocation from Step 2.5 — if Python is assigned to exp-1-2, it may NOT appear in any other bullet.

HARD CONSTRAINTS (HIGHEST PRIORITY — check these FIRST before any other rules. Violating = resume WORSE than not tailoring):

HC1 — TECHNOLOGY ALLOWLIST (CHECK FIRST, ZERO TOLERANCE):
You may ONLY use tech from: (1) JD, (2) candidate's original bullets, (3) candidate's SKILLS section.
FORBIDDEN tech injections:
- BeautifulSoup, D3.js, OpenAI, nginx, Redis, Kafka, matplotlib, Celery, Flask, Terraform, CloudWatch — ALL FORBIDDEN unless in JD or candidate's skills/original bullets
- NEVER swap one specific tech for another not in original: Selenium→BeautifulSoup (NO), Gemini API→OpenAI API (NO), Express.js→nginx (NO)
- NEVER invent tech the candidate doesn't list: if skills say "Pandas" and original uses Pandas, you CANNOT change to "Java" even if JD wants Java
Generic descriptions OK when dropping irrelevant tech ("web scraper" vs "Selenium scraper", "backend service" vs "Express.js API"), but NEVER replace with different specific tech not in original or skills.

HC2 — ANTI-FABRICATION (CHECK SECOND, ZERO TOLERANCE):
Tailored bullet = SAME WORK, SAME COMPLEXITY, SAME LANGUAGE/FRAMEWORK as original. Use JD vocabulary to DESCRIBE it, not TRANSFORM it.
FORBIDDEN fabrications (real examples):
- Java Spring Boot → C++ systems programming (different language + different complexity level)
- Python/Pandas data validation → Java data validation (swapped language not in original)
- React UI with filters → hash maps and search algorithms (fabricated data structures/algorithms)
- python-pptx PowerPoint → SQL stored procedures (completely different work)
- Express.js backend → TCP socket programming with async I/O (fabricated low-level implementation)
- Salesforce data validation → trading reference data validation (fabricated domain context)
LANGUAGE SWAP RULE (ABSOLUTE ZERO TOLERANCE — this is the #1 failure mode, check EVERY bullet):
NEVER change the programming language used in the original bullet. Java→Java, Python→Python, TypeScript→TypeScript, JavaScript→JavaScript.
EXAMPLES OF FORBIDDEN SWAPS (these are ALWAYS wrong, even if JD wants different language):
  ❌ Original: "Java Spring Boot microservice" + JD wants C++ → CANNOT write "C++ system" or "microservice in C++"
     ✅ Instead: "Java microservice with low-latency optimizations" OR "scalable backend service" (no language)
  ❌ Original: "Pandas data validation" + JD wants Java → CANNOT write "Java data validation" or "data validation in Java"
     ✅ Instead: "Python data validation pipeline" OR "data validation system" (no language)
  ❌ Original: "React/TypeScript UI" + JD wants C++ → CANNOT write "C++ interface" or "interface in C++" or "data access interface in C++"
     ✅ Instead: "TypeScript data access interface with filters" OR "data access interface" (no language)
     CRITICAL: "in C++", "using C++", "with C++" are ALL FORBIDDEN if original was TypeScript.
If original language is JD-irrelevant: DROP language entirely ("backend service", "data access interface") OR keep original language and add JD context ("Java service on Linux"). NEVER EVER swap to different language.
What IS allowed: "React search UI" → "data access interface with filtering" (same work, JD terms). "Spring Boot microservice" → "scalable Java service" (same tech + JD term). "reporting pipeline" → "data pipeline" (same concept, JD term). "Google Cloud Run" → "cloud deployment" or "deployed on Linux" if JD mentions Linux.
Modest tailoring OK if work doesn't map strongly to JD — "automated data collection" for a scraper is fine, doesn't need fabricated systems details.

KEYWORD INTEGRATION RULES:
- Maximize keyword coverage where the underlying work SUPPORTS it. Every bullet should use JD language where the original work naturally maps, but don't force keywords into bullets where the connection is a stretch. A bullet can stay lightly modified if the remaining JD keywords don't genuinely relate to that work.
- REFRAME using JD's EXACT noun phrases — not looser synonyms. "reporting pipeline" → "data pipeline" when JD says "data pipelines". "cloud deployment" → "deployed on Linux" when JD requires Linux. "reduced latency" → "low-latency" when JD says "low-latency". Always use the JD's specific term, never a vaguer paraphrase.
- NEVER swap programming languages (Java→C++, Python→Java, JavaScript→Rust, TypeScript→Go). If bullet uses Java, keep Java or drop to generic description. Same for all languages.
- NEVER swap specific frameworks/libraries 1:1 unless the EXACT swap appears in original (Express.js→nginx NO, Pandas→Java NO, React→Vue NO).
- MAY swap within same narrow category IF candidate knows both: DB→DB (PostgreSQL→MySQL if candidate lists both), but NEVER cross-category (React→C++, Express.js→embedded, web framework→systems language).
- ANTI-GENERICIZATION: Every removed tech MUST be replaced with a JD-relevant term — never leave a void. "Built backend with Express.js" for a systems JD → "Built low-latency data service on Linux", NOT "Built backend system". If a bullet becomes vaguer than the original after tailoring, add JD terms until specificity matches or exceeds the original.
- ANTI-COPY-PASTE: Use JD VOCABULARY (individual terms, 2-3 word phrases) but write ORIGINAL sentences. NEVER copy clauses of 6+ consecutive words from the JD. If JD says "systems to collect, analyze, and visualize large amounts of data", do NOT write that phrase — distribute individual terms ("data visualization", "market data collection", "analytics platform") across separate bullets in original sentence structures.
- HONEST REFRAMING: Do NOT inflate the nature of technology. An LLM/chatbot API (GPT, Gemini, Claude) is NOT "machine learning" for roles involving statistical ML, model training, or quantitative modeling — call it "LLM API", "AI API", or "generative AI". Only say "machine learning" if the original work involved actual ML (training models, feature engineering, statistical inference).
- Keep the same specificity level. Don't replace "React/TypeScript" with just "JavaScript".
- Use JD domain language to DESCRIBE existing work. If JD mentions "JSON transformation", "admin dashboards", "bulk operations", "workflow management", "serverless" — reword bullets to use those exact phrases where the underlying work supports it.
- You MAY add brief process context ONLY if it fits naturally and doesn't bloat the bullet
- Process keywords (testing, code reviews, Agile) must be CAUSALLY related to the action. "Reducing latency via code reviews" is WRONG — code reviews don't reduce latency. Instead: "Built X with unit testing and code reviews" is correct.
- Distribute JD keywords across modified bullets — don't cluster the same keyword in every one
- Candidate's signature skills: ${alwaysIncludeSkills.join(", ")}. This list is FULLY OVERRIDDEN by tech relevance: if a skill doesn't appear in or relate to the JD, do NOT mention it at all. Spring Boot, Next.js, Express.js, React, Node.js, JavaScript — drop ALL of these for non-web JDs (systems, embedded, quant, ML, infra, etc.). JavaScript is a web language; for non-web roles, suppress and reframe. JD-specific keywords ALWAYS take absolute priority.

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
- DEDUP (zero tolerance — #1 most common failure mode):
  - Each technology name may appear in AT MOST ONE bullet across the ENTIRE set (all jobs combined, not per-job). If Python appears in 3 originals, pick the ONE strongest bullet for Python; describe the others via outcomes or DIFFERENT tech from the candidate's skills (e.g., use C++, Java, SQL in those bullets instead).
  - Each noun phrase (e.g., "data pipeline", "optimization") may appear AT MOST ONCE across all bullets.
  - Use the JD's full vocabulary — if JD says "machine learning", "deep learning", "optimization", "GPU", "AI" — that's 5 different phrases to distribute, not 1 repeated 5 times.
  - Before returning, build a FREQUENCY TABLE: list every tech name and noun phrase with its count. If ANY appears more than once, rewrite NOW. This includes Python, Linux, C++, Java, "data pipeline", "low-latency", etc.

FINAL VERIFICATION (mandatory before outputting JSON — check in THIS order):
1. LANGUAGE SWAP CHECK (ABSOLUTE HIGHEST PRIORITY — if this fails, entire output is rejected):
   For EACH bullet, compare languages:
   - Extract programming language from ORIGINAL bullet (Java, Python, JavaScript, TypeScript, C++, Rust, Go, etc.)
   - Extract programming language from TAILORED bullet
   - If DIFFERENT, this is FABRICATION — rewrite NOW using original language or generic description
   SPECIFIC CHECKS (zero tolerance):
   - Original has "Java" → tailored must have "Java" OR no language ("backend service"). NEVER "C++", "Python", "Rust".
   - Original has "Python" or "Pandas" → tailored must have "Python" OR no language. NEVER "Java", "C++".
   - Original has "TypeScript" or "React/TypeScript" → tailored must have "TypeScript" OR no language. NEVER "C++", "Rust", "JavaScript".
   - Original has "JavaScript" or "Express.js" → tailored must have "JavaScript" OR no language. NEVER "Python", "C++".
   CRITICAL: Check for language mentions ANYWHERE in tailored bullet — "in C++", "using C++", "with C++", "C++ interface" are ALL violations if original was TypeScript.
   If ANY bullet swapped languages, STOP and fix NOW before proceeding to next check.
2. HC1 ALLOWLIST CHECK: For EVERY technology/library/tool name in each bullet, verify it exists in EITHER the JD OR the candidate's skills/original bullets. If ANY tech is not from these two sources, REMOVE it and use a generic description instead.
   CHECK EVERY TECH NAME (zero tolerance for hallucinations):
   - BeautifulSoup, D3.js, OpenAI, CloudWatch, nginx, Redis, Kafka, Celery, Flask, Terraform — FORBIDDEN unless in JD/skills/original
   - matplotlib, seaborn, plotly — FORBIDDEN unless in JD/skills/original
   - cron, systemd, supervisord — FORBIDDEN unless in JD/skills/original (use "scheduled tasks" instead)
   - Linux, Unix — OK to add if JD requires it and work involved deployment/cloud/systems
   - SQL, MySQL, PostgreSQL — OK to add if JD requires it and candidate lists it in skills (even if original used different tool)
   If you want to add a tech name, CHECK: is it in JD? Is it in candidate's skills? Is it in the original bullet? If NO to all three → use generic description.
3. HC2 FABRICATION CHECK: Compare each tailored bullet to its original. Does the tailored version claim implementation details (data structures, algorithms, specific protocols, performance numbers, domain context) NOT present in the original? If yes, REMOVE the fabricated detail.
   FORBIDDEN fabrications to check for:
   - Data structures: "hash maps", "binary search trees", "B-trees", "heaps" — if not in original, DELETE
   - Protocols: "TCP sockets", "UDP", "gRPC", "HTTP/2" — if not in original, DELETE
   - Performance metrics: "sub-millisecond", "10K+ records", "1M rows", "sub-second" — if not in original, DELETE
   - Implementation details: "asynchronous I/O", "connection pooling", "stored procedures", "virtualized scrolling", "memoized rendering" — if not in original, DELETE
   - Domain reframing (acceptable if work is similar): Salesforce data→"reference data", real estate→"backend systems", SEO→"data collection" — OK to use JD domain vocabulary if underlying work is analogous
   - Domain fabrication (FORBIDDEN): Adding context that changes the nature of work — e.g., simple CRUD→"order execution", reporting→"high-frequency trading systems", UI→"low-level systems programming"
4. VERB DEDUP: Extract the leading verb of every bullet. Any duplicates? If yes, change one NOW. Zero tolerance.
5. TECH DEDUP: List every technology name across ALL bullets with count. Does any appear more than once? If yes, fix NOW.
6. WEB TECH: For non-web JDs, do any bullets still contain React, Express, Spring Boot, Next.js, Node.js, or JavaScript? If yes, suppress and reframe.
7. COPY-PASTE: Does any bullet contain 6+ consecutive words from the JD? If yes, rephrase.
8. JD COVERAGE: Does each JD+candidate skill match appear in at least one bullet? If not, add it (respecting HC1 and HC2).
9. METRIC-CONTEXT: For each reframed bullet, does the metric make sense in the new context?

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
- METRIC-CONTEXT COHERENCE: When reframing a bullet's domain (e.g., real estate → trading), the metric must still make logical sense. "Lead conversion" is incoherent in a trading/systems context. Either keep the metric domain-neutral ("improved throughput 30%", "increased efficiency 30%") or adjust framing so metric and domain align. A hiring manager will spot when a sales metric is grafted onto a systems context.
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

Return ONLY a JSON object (no markdown fences) with this exact structure:
{
  "techAllocation": {"Python": "exp-1-2", "C++": "exp-2-3", "Java": "exp-2-1", ...},
  "techFrequency": {"Python": 1, "C++": 1, "Java": 1, "Linux": 1, ...},
  "bullets": [{"id": "...", "tailoredText": "..."}]
}
techAllocation = your binding plan from Step 2.5.
techFrequency = count of each tech name across ALL bullets. Every value MUST be 1. If any value is 2+, fix the bullets before returning.`;

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

CHECK EACH BULLET FOR THESE ISSUES AND FIX (in priority order):

1. LANGUAGE SWAP CHECK (ABSOLUTE HIGHEST PRIORITY — zero tolerance): For each bullet, compare the programming language in original vs tailored. If DIFFERENT (Java→C++, Python→Java, Pandas/Python→Java, JavaScript→Rust), this is FABRICATION. Revert to original language immediately or use generic description.
   REAL EXAMPLES FROM PAST FAILURES (these exact violations happened — prevent them):
   ❌ Original: "Java Spring Boot microservice" → Tailored: "C++ with asynchronous I/O and TCP socket programming"
      ✅ Fix: "Java microservice with low-latency optimizations" OR "scalable backend service"
   ❌ Original: "Pandas, AWS S3 data validation" → Tailored: "Java data validation"
      ✅ Fix: "Python data validation with cloud storage" OR "data validation system"
   ❌ Original: "React/TypeScript UI with filters" → Tailored: "C++ interface" OR "fast data access interface in C++"
      ✅ Fix: "TypeScript data access interface with search filters" OR "data access interface" (NO LANGUAGE)
      CRITICAL: TypeScript→C++ is FORBIDDEN even if JD wants C++. Keep TypeScript OR drop language entirely.
   ❌ Original: "python-pptx PowerPoint" → Tailored: "SQL stored procedures"
      ✅ Fix: "Python automated reporting" OR "report generation system"

2. INJECTED TECH CHECK (SECOND HIGHEST PRIORITY — zero tolerance): For EVERY named technology/library/tool in each bullet, verify it exists in EITHER (a) the JD or (b) the candidate's skills section or original bullets. If a tech name is NOT from these two sources, it is HALLUCINATED and must be REMOVED immediately. Replace with a generic description.
Common hallucinations to check for: BeautifulSoup, D3.js, OpenAI, CloudWatch, nginx, matplotlib, Redis, Kafka, Celery, Flask, Terraform.
Also check: if the original says "Selenium", the tailored CANNOT say "BeautifulSoup". If original says "Gemini API", tailored CANNOT say "OpenAI API". Keep original tech or use generic description.

3. FABRICATION CHECK (THIRD PRIORITY): Compare each tailored bullet to its original. If the tailored version claims implementation details NOT present in the original, REMOVE them:
- Data structures not in original (hash maps, binary search trees, B-trees) → REMOVE
- Protocols not in original (TCP sockets, UDP, gRPC) → REMOVE
- Performance claims not in original ("sub-millisecond", "1M rows", "sub-second") → REMOVE
- Implementation techniques not in original (connection pooling, stored procedures, asynchronous I/O) → REMOVE
- Domain context not in original (Salesforce→trading data, real estate→quant systems) → REMOVE
The tailored bullet must describe the SAME WORK at the SAME COMPLEXITY. A search UI with filters cannot become a low-level systems implementation. A PowerPoint generator cannot become "SQL stored procedures". A Salesforce validation script cannot become "trading reference data".

4. WEB FRAMEWORK SUPPRESSION: If web-specific tech (React, Express, Spring Boot, Next.js, Node.js, JavaScript) remains in bullets but DOESN'T appear in the JD, suppress and reframe using JD vocabulary. JavaScript is web tech — for systems/quant/ML/infra roles, drop it. This overrides the always-include skills list.

5. LENGTH VIOLATIONS:
   - Under 90 chars → too sparse, add JD keywords or technical detail to reach 90-105
   - 106-179 chars → dead zone, either cut to 90-105 or expand to 180-210
   - Over 210 chars → too long, cut to ≤210. NEVER allow 3-line bullets.
   - Target: 90-105 chars for 1-line bullets (preferred), 180-210 for 2-line (max 1-2 per entry)

6. KEYWORD GAPS (highest priority): ENUMERATE every JD technology and domain term. For each, verify it appears in at least one bullet. Focus on: (a) JD programming languages the candidate knows — EACH must appear in a bullet, (b) JD platforms/OS (Linux, Unix) — must be mentioned if required, (c) JD domain phrases ("data pipelines", "low-latency", "systems programming") — if bullets use generic alternatives ("pipeline", "reduced latency", "backend"), swap to JD's exact phrases. If a JD-required language like C++ or Python is absent from all bullets despite the candidate knowing it, this is the #1 issue to fix.

7. TECH/PHRASE DEDUP (zero tolerance — most common failure): Build a frequency table of every tech name and noun phrase across ALL bullets (all jobs combined). If ANY tech name appears more than once (e.g., Python in 3 bullets, Linux in 2), keep it in the ONE strongest bullet and rewrite others using DIFFERENT tech from candidate's skills or outcome-focused language. If any noun phrase repeats, replace with different JD vocabulary. Python x3 is the #1 offender — fix aggressively.

8. FABRICATED METRICS: If the tailored version has a number/metric (%, $, hours) that does NOT appear in the original, REMOVE that metric. Adding plausible technical context (tools, methods, systems language) is fine — only fabricated NUMBERS are not allowed.

9. VERB REPETITION (zero tolerance): Extract the first word of EVERY bullet into a list. If ANY two match (case-insensitive), rewrite one immediately. E.g., if you see [Built, Built, Designed, Optimized, Developed, Implemented] → two "Built" → change one to "Engineered" or "Automated". Every single bullet must start with a different verb.

10. GENERIC REFRAMING: If any bullet uses vague terms ("workflow optimization", "intelligent workflow", "backend system") when the JD has specific domain vocabulary available (e.g., "machine learning", "optimization algorithms", "GPU-accelerated"), replace the generic term with the JD's exact phrase where the underlying work supports it.

11. GENERICIZATION CHECK: Compare each tailored bullet to its original. If the tailored version LOST specific tech names or details without replacing them with JD-equivalent terms, it's under-tailored. E.g., original had "Salesforce data with Pandas" → tailored says "data validation with Python" but JD mentions "data pipelines" → rewrite as "data pipeline validation with Python". Every removed detail must be backfilled with JD vocabulary (but NEVER change the programming language — Pandas stays Python).

12. COPY-PASTE CHECK: Does any bullet contain a multi-word sequence (6+ consecutive words) lifted verbatim from the JD? This looks like the candidate copy-pasted the job posting and a hiring manager WILL notice. Rephrase using individual JD terms in original sentence structures.

13. METRIC-CONTEXT COHERENCE: When the domain was reframed (e.g., real estate → trading), check if the metric still makes sense. "Lead conversion" in "trading operations" is incoherent — a quant firm doesn't have "leads". Neutralize ("increased throughput 30%") or adjust framing so metric and domain align.

14. HONEST TECH CLAIMS: An LLM/chatbot API (GPT, Gemini, Claude) is NOT "machine learning" for roles involving statistical ML, model training, or quantitative modeling. If a bullet says "machine learning" but the original work was LLM/AI API usage, change to "AI API", "LLM API", or "generative AI".

RULES:
- If a bullet uses JD domain vocabulary AND has no issues above, return it EXACTLY as-is
- Keep all real metrics/numbers from originals intact
- NEVER use em dashes or en dashes
- Only use tech from the JD or the candidate's skills section — no injected tech from nowhere
- Output must follow length rules strictly: 90-105 or 180-210 chars per bullet

Return ONLY a JSON object (no markdown fences) with this exact structure:
{
  "techFrequency": {"Python": 1, "C++": 1, "Java": 1, "Linux": 1, ...},
  "bullets": [{"id": "...", "tailoredText": "..."}]
}
techFrequency = count of each tech name across ALL bullets. Every value MUST be 1. If any is 2+, fix before returning.`;

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
