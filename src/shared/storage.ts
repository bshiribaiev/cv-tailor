import type { Resume } from "../parser/types";

const KEYS = {
  apiKey: "gemini_api_key",
  model: "gemini_model",
  rawTex: "raw_tex",
  parsedResume: "parsed_resume",
} as const;

export const DEFAULT_MODEL = "gemini-2.5-flash";

export async function saveApiKey(key: string): Promise<void> {
  await chrome.storage.local.set({ [KEYS.apiKey]: key });
}

export async function getApiKey(): Promise<string | null> {
  const result = await chrome.storage.local.get(KEYS.apiKey);
  return (result[KEYS.apiKey] as string) ?? null;
}

export async function saveModel(model: string): Promise<void> {
  await chrome.storage.local.set({ [KEYS.model]: model });
}

export async function getModel(): Promise<string> {
  const result = await chrome.storage.local.get(KEYS.model);
  return (result[KEYS.model] as string) ?? DEFAULT_MODEL;
}

export async function saveResume(
  rawTex: string,
  parsed: Resume,
): Promise<void> {
  await chrome.storage.local.set({
    [KEYS.rawTex]: rawTex,
    [KEYS.parsedResume]: parsed,
  });
}

export async function getResume(): Promise<{
  rawTex: string;
  parsed: Resume;
} | null> {
  const result = await chrome.storage.local.get([
    KEYS.rawTex,
    KEYS.parsedResume,
  ]);
  if (!result[KEYS.rawTex] || !result[KEYS.parsedResume]) return null;
  return {
    rawTex: result[KEYS.rawTex] as string,
    parsed: result[KEYS.parsedResume] as Resume,
  };
}

export async function saveTailoringState(state: {
  stage: string;
  pct: number;
  pdfBase64?: string;
  texBase64?: string;
  filename?: string;
  error?: string;
}): Promise<void> {
  await chrome.storage.session.set({ tailoring_state: state });
}

export async function getTailoringState(): Promise<{
  stage: string;
  pct: number;
  pdfBase64?: string;
  texBase64?: string;
  filename?: string;
  error?: string;
} | null> {
  const result = await chrome.storage.session.get("tailoring_state");
  return (result.tailoring_state as {
    stage: string;
    pct: number;
    pdfBase64?: string;
    texBase64?: string;
    filename?: string;
    error?: string;
  }) ?? null;
}

export async function clearTailoringState(): Promise<void> {
  await chrome.storage.session.remove("tailoring_state");
}
