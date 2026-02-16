import type { Resume } from "../parser/types";

export type Provider = "gemini" | "anthropic";

const KEYS = {
  provider: "llm_provider",
  apiKey: "gemini_api_key",
  model: "gemini_model",
  anthropicApiKey: "anthropic_api_key",
  anthropicModel: "anthropic_model",
  rawTex: "raw_tex",
  parsedResume: "parsed_resume",
  tailorSkills: "tailor_skills",
  customInstructions: "custom_instructions",
} as const;

export const DEFAULT_MODEL = "gemini-2.5-flash";
export const DEFAULT_ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";

export async function saveProvider(provider: Provider): Promise<void> {
  await chrome.storage.local.set({ [KEYS.provider]: provider });
}

export async function getProvider(): Promise<Provider> {
  const result = await chrome.storage.local.get(KEYS.provider);
  return (result[KEYS.provider] as Provider) ?? "gemini";
}

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

export async function saveAnthropicApiKey(key: string): Promise<void> {
  await chrome.storage.local.set({ [KEYS.anthropicApiKey]: key });
}

export async function getAnthropicApiKey(): Promise<string | null> {
  const result = await chrome.storage.local.get(KEYS.anthropicApiKey);
  return (result[KEYS.anthropicApiKey] as string) ?? null;
}

export async function saveAnthropicModel(model: string): Promise<void> {
  await chrome.storage.local.set({ [KEYS.anthropicModel]: model });
}

export async function getAnthropicModel(): Promise<string> {
  const result = await chrome.storage.local.get(KEYS.anthropicModel);
  return (result[KEYS.anthropicModel] as string) ?? DEFAULT_ANTHROPIC_MODEL;
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

/** Whether to tailor the Skills section (default true). When false, skills are left unchanged. */
export async function getTailorSkills(): Promise<boolean> {
  const result = await chrome.storage.local.get(KEYS.tailorSkills);
  return result[KEYS.tailorSkills] !== false; // default true
}

export async function saveTailorSkills(value: boolean): Promise<void> {
  await chrome.storage.local.set({ [KEYS.tailorSkills]: value });
}

/** User-provided custom instructions passed to the LLM (e.g. "Don't touch Projects, keep Experience minimal"). */
export async function getCustomInstructions(): Promise<string> {
  const result = await chrome.storage.local.get(KEYS.customInstructions);
  return (result[KEYS.customInstructions] as string) ?? "";
}

export async function saveCustomInstructions(value: string): Promise<void> {
  await chrome.storage.local.set({ [KEYS.customInstructions]: (value ?? "").trim() });
}

export type TailoringState = {
  stage: string;
  pct: number;
  pdfBase64?: string;
  texBase64?: string;
  filename?: string;
  error?: string;
};

function tailoringKey(tabId: number): string {
  return `tailoring_state_${tabId}`;
}

export async function saveTailoringState(tabId: number, state: TailoringState): Promise<void> {
  await chrome.storage.session.set({ [tailoringKey(tabId)]: state });
}

export async function getTailoringState(tabId: number): Promise<TailoringState | null> {
  const key = tailoringKey(tabId);
  const result = await chrome.storage.session.get(key);
  return (result[key] as TailoringState) ?? null;
}

export async function clearTailoringState(tabId: number): Promise<void> {
  await chrome.storage.session.remove(tailoringKey(tabId));
}
