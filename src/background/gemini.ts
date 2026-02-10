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
  const prompt = `You are a resume tailoring assistant. Given a job description and a list of resume bullet points, reword each bullet to naturally incorporate relevant keywords from the job description.

RULES:
- Keep the same achievement/metric/outcome — only adjust phrasing
- Do NOT fabricate new achievements, technologies, or metrics
- Do NOT change numbers, percentages, or dollar amounts
- Incorporate 1-3 relevant keywords per bullet where natural
- Keep bullet length similar to original (within 15 words)
- Maintain professional tone
- These skills should always be mentioned somewhere if relevant: ${alwaysIncludeSkills.join(", ")}

JOB DESCRIPTION:
${jobDescription}

RESUME BULLETS:
${JSON.stringify(bullets.map((b) => ({ id: b.id, text: b.originalText })))}

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
  const prompt = `You are a resume tailoring assistant. Given a job description and skill categories from a resume, reorder the skills within each category to prioritize skills most relevant to the job description.

RULES:
- Do NOT add skills that aren't already listed
- Do NOT remove any skills
- Only reorder within each category — put most relevant skills first
- These skills must always appear: ${alwaysIncludeSkills.join(", ")}
- Keep the same format: comma-separated list

JOB DESCRIPTION:
${jobDescription}

SKILL CATEGORIES:
${JSON.stringify(skillLines)}

Return a JSON array: [{"label": "...", "tailoredItems": "..."}]`;

  const result = await callGemini(apiKey, prompt);
  return JSON.parse(result) as TailoredSkills[];
}

async function callGemini(apiKey: string, prompt: string): Promise<string> {
  const model = "gemini-2.0-flash";
  const url = `${GEMINI_BASE}/${model}:generateContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.3,
        responseMimeType: "application/json",
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API error (${res.status}): ${err}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Empty response from Gemini");
  return text;
}

export async function testApiKey(apiKey: string): Promise<boolean> {
  try {
    const result = await callGemini(apiKey, 'Respond with exactly: {"ok": true}');
    const parsed = JSON.parse(result);
    return parsed.ok === true;
  } catch {
    return false;
  }
}
