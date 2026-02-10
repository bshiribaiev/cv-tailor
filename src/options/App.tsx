import { useState, useEffect } from "preact/hooks";
import { parseLatex } from "../parser/latex-parser";
import {
  saveApiKey,
  getApiKey,
  saveModel,
  getModel,
  saveResume,
  getResume,
  DEFAULT_MODEL,
} from "../shared/storage";
import type { Resume } from "../parser/types";

export function App() {
  const [apiKey, setApiKey] = useState("");
  const [apiKeyStatus, setApiKeyStatus] = useState<
    "idle" | "testing" | "valid" | "invalid"
  >("idle");
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [texContent, setTexContent] = useState("");
  const [parsedResume, setParsedResume] = useState<Resume | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    // Load existing data
    getApiKey().then((key) => {
      if (key) {
        setApiKey(key);
        setApiKeyStatus("valid");
      }
    });
    getModel().then(setModel);
    getResume().then((data) => {
      if (data) {
        setTexContent(data.rawTex);
        setParsedResume(data.parsed);
      }
    });
  }, []);

  async function handleSaveApiKey() {
    await saveApiKey(apiKey);
    setApiKeyStatus("testing");
    setApiKeyError(null);
    // Route test through service worker (has host_permissions)
    chrome.runtime.sendMessage(
      { type: "TEST_API_KEY", payload: { apiKey } },
      (res) => {
        if (res?.valid) {
          setApiKeyStatus("valid");
        } else {
          setApiKeyStatus("invalid");
          setApiKeyError(res?.error ?? "Unknown error");
        }
      },
    );
  }

  function handleFileUpload(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const content = reader.result as string;
      setTexContent(content);
      handleParse(content);
    };
    reader.readAsText(file);
  }

  function handleParse(tex: string) {
    try {
      const resume = parseLatex(tex);
      setParsedResume(resume);
      setParseError(null);

      // Count bullets
      let bulletCount = 0;
      for (const section of resume.sections) {
        for (const entry of section.entries) {
          bulletCount += entry.bullets.length;
        }
      }
      console.log(`Parsed: ${resume.sections.length} sections, ${bulletCount} bullets`);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : String(err));
      setParsedResume(null);
    }
  }

  async function handleSaveResume() {
    if (!parsedResume) return;
    await saveResume(texContent, parsedResume);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function countBullets(resume: Resume): number {
    let count = 0;
    for (const section of resume.sections) {
      for (const entry of section.entries) {
        count += entry.bullets.length;
      }
    }
    return count;
  }

  return (
    <div class="max-w-2xl mx-auto p-6 bg-white">
      <h1 class="text-2xl font-bold mb-6">CV Tailor Settings</h1>

      {/* API Key */}
      <section class="mb-8">
        <h2 class="text-lg font-semibold mb-3">Gemini API Key</h2>
        <div class="flex gap-2">
          <input
            type="password"
            value={apiKey}
            onInput={(e) => setApiKey((e.target as HTMLInputElement).value)}
            placeholder="Enter your Gemini API key"
            class="flex-1 px-3 py-2 border rounded text-sm"
          />
          <button
            onClick={handleSaveApiKey}
            class="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
          >
            Save & Test
          </button>
        </div>
        {apiKeyStatus === "testing" && (
          <p class="text-sm text-gray-500 mt-1">Testing...</p>
        )}
        {apiKeyStatus === "valid" && (
          <p class="text-sm text-green-600 mt-1">API key is valid</p>
        )}
        {apiKeyStatus === "invalid" && (
          <div class="text-sm text-red-600 mt-1">
            <p>
              API key test failed. Get one at{" "}
              <a
                href="https://aistudio.google.com/apikey"
                target="_blank"
                class="underline"
              >
                aistudio.google.com
              </a>
            </p>
            {apiKeyError && (
              <p class="text-xs text-gray-500 mt-1">Error: {apiKeyError}</p>
            )}
          </div>
        )}
      </section>

      {/* Model Selection */}
      <section class="mb-8">
        <h2 class="text-lg font-semibold mb-3">Gemini Model</h2>
        <select
          value={model}
          onChange={async (e) => {
            const val = (e.target as HTMLSelectElement).value;
            setModel(val);
            await saveModel(val);
          }}
          class="px-3 py-2 border rounded text-sm"
        >
          <option value="gemini-2.5-flash">Gemini 2.5 Flash (recommended)</option>
          <option value="gemini-3-flash-preview">Gemini 3 Flash (preview)</option>
          <option value="gemini-2.5-pro">Gemini 2.5 Pro</option>
          <option value="gemini-2.5-flash-lite">Gemini 2.5 Flash Lite (fastest)</option>
        </select>
      </section>

      {/* Resume Upload */}
      <section class="mb-8">
        <h2 class="text-lg font-semibold mb-3">Master Resume (.tex file)</h2>

        <div class="mb-3">
          <label class="block text-sm font-medium mb-1">Upload .tex file</label>
          <input
            type="file"
            accept=".tex"
            onChange={handleFileUpload}
            class="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
          />
        </div>

        <div class="mb-3">
          <label class="block text-sm font-medium mb-1">Or paste .tex content</label>
          <textarea
            value={texContent}
            onInput={(e) => {
              const val = (e.target as HTMLTextAreaElement).value;
              setTexContent(val);
              if (val.trim()) handleParse(val);
            }}
            placeholder="Paste your .tex file content here..."
            class="w-full h-40 px-3 py-2 border rounded text-xs font-mono"
          />
        </div>

        {parseError && (
          <p class="text-sm text-red-600 mb-2">Parse error: {parseError}</p>
        )}

        {parsedResume && (
          <div class="bg-gray-50 rounded p-3 mb-3">
            <p class="text-sm font-medium mb-2">Parsed Resume Preview</p>
            <p class="text-sm">Name: {parsedResume.name}</p>
            <p class="text-sm">
              Contacts: {parsedResume.contacts.map((c) => c.text).join(", ")}
            </p>
            <p class="text-sm">Sections: {parsedResume.sections.length}</p>
            <ul class="text-sm ml-4 list-disc">
              {parsedResume.sections.map((s) => (
                <li key={s.title}>
                  {s.title} — {s.entries.length} entries,{" "}
                  {s.entries.reduce((n, e) => n + e.bullets.length, 0)} bullets
                  {s.type === "skills" &&
                    s.entries[0]?.skillLines &&
                    `, ${s.entries[0].skillLines.length} skill categories`}
                </li>
              ))}
            </ul>
            <p class="text-sm mt-1">
              Total bullets: {countBullets(parsedResume)}
            </p>
          </div>
        )}

        <button
          onClick={handleSaveResume}
          disabled={!parsedResume}
          class="px-4 py-2 bg-green-600 text-white rounded text-sm hover:bg-green-700 disabled:opacity-50"
        >
          Save Resume
        </button>
        {saved && (
          <span class="text-sm text-green-600 ml-2">Saved!</span>
        )}
      </section>
    </div>
  );
}
