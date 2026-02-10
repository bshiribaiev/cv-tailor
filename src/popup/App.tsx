import { useState, useEffect } from "preact/hooks";
import type { Message } from "../shared/messages";
import { getTailoringState, clearTailoringState } from "../shared/storage";
import { extractJobDescription } from "../content/extractor";

type Stage = "idle" | "extracting" | "tailoring" | "generating" | "done" | "error";

export function App() {
  const [hasResume, setHasResume] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [stage, setStage] = useState<Stage>("idle");
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState("");
  const [pdfBase64, setPdfBase64] = useState<string | null>(null);
  const [filename, setFilename] = useState("Resume_Tailored.pdf");
  const [error, setError] = useState<string | null>(null);
  const [jobDescription, setJobDescription] = useState<string | null>(null);

  useEffect(() => {
    // Check status
    chrome.runtime.sendMessage({ type: "GET_STATUS" } as Message, (res) => {
      if (res?.payload) {
        setHasResume(res.payload.hasResume);
        setHasApiKey(res.payload.hasApiKey);
      }
    });

    // Check for in-progress state
    getTailoringState().then((state) => {
      if (state) {
        if (state.pdfBase64) {
          setStage("done");
          setPdfBase64(state.pdfBase64);
          setFilename(state.filename ?? "Resume_Tailored.pdf");
          setProgress(100);
        } else if (state.error) {
          setStage("error");
          setError(state.error);
        } else {
          setStage("tailoring");
          setProgress(state.pct);
          setStatusText(state.stage);
        }
      }
    });

    // Listen for progress
    const listener = (message: Message) => {
      if (message.type === "TAILORING_PROGRESS") {
        setStage("tailoring");
        setProgress(message.payload.pct);
        setStatusText(message.payload.stage);
      } else if (message.type === "TAILORING_COMPLETE") {
        setStage("done");
        setPdfBase64(message.payload.pdfBase64);
        setFilename(message.payload.filename);
        setProgress(100);
      } else if (message.type === "TAILORING_ERROR") {
        setStage("error");
        setError(message.payload.error);
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  async function handleExtract() {
    setStage("extracting");
    setStatusText("Extracting job description...");
    setError(null);

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) {
        setStage("error");
        setError("No active tab found");
        return;
      }

      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: extractJobDescription,
      });

      const jd = results?.[0]?.result;
      if (!jd?.description) {
        setStage("error");
        setError("Could not extract job description from this page.");
        return;
      }

      setJobDescription(jd.description);
      setStatusText(
        `Found: ${jd.title || "Job posting"} ${jd.company ? `@ ${jd.company}` : ""}`,
      );

      // Start tailoring
      setStage("tailoring");
      chrome.runtime.sendMessage({
        type: "START_TAILORING",
        payload: { jobDescription: jd.description },
      } as Message);
    } catch (err) {
      setStage("error");
      setError(
        err instanceof Error ? err.message : "Failed to extract job description",
      );
    }
  }

  function handleDownload() {
    if (!pdfBase64) return;
    const byteChars = atob(pdfBase64);
    const bytes = new Uint8Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) {
      bytes[i] = byteChars.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleReset() {
    await clearTailoringState();
    setStage("idle");
    setPdfBase64(null);
    setError(null);
    setProgress(0);
    setStatusText("");
    setJobDescription(null);
  }

  const isReady = hasResume && hasApiKey;

  return (
    <div class="w-[380px] p-4 bg-white text-gray-900">
      <h1 class="text-lg font-bold mb-3">CV Tailor</h1>

      {/* Status indicators */}
      <div class="space-y-1 mb-4 text-sm">
        <div class="flex items-center gap-2">
          <span class={hasResume ? "text-green-600" : "text-red-500"}>
            {hasResume ? "\u2713" : "\u2717"}
          </span>
          <span>Resume {hasResume ? "loaded" : "not loaded"}</span>
        </div>
        <div class="flex items-center gap-2">
          <span class={hasApiKey ? "text-green-600" : "text-red-500"}>
            {hasApiKey ? "\u2713" : "\u2717"}
          </span>
          <span>API key {hasApiKey ? "set" : "not set"}</span>
        </div>
        {!isReady && (
          <button
            class="text-blue-600 text-xs underline mt-1"
            onClick={() => chrome.runtime.openOptionsPage()}
          >
            Configure in settings
          </button>
        )}
      </div>

      {/* Main action */}
      {stage === "idle" && (
        <button
          class="w-full py-2 px-4 bg-blue-600 text-white rounded font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={handleExtract}
          disabled={!isReady}
        >
          Tailor Resume to This Page
        </button>
      )}

      {/* Progress */}
      {(stage === "extracting" || stage === "tailoring" || stage === "generating") && (
        <div class="space-y-2">
          <p class="text-sm text-gray-600">{statusText}</p>
          <div class="w-full bg-gray-200 rounded-full h-2">
            <div
              class="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Done */}
      {stage === "done" && (
        <div class="space-y-3">
          <p class="text-sm text-green-600 font-medium">Resume tailored!</p>
          <button
            class="w-full py-2 px-4 bg-green-600 text-white rounded font-medium hover:bg-green-700"
            onClick={handleDownload}
          >
            Download PDF
          </button>
          <button
            class="w-full py-2 px-4 bg-gray-200 text-gray-700 rounded font-medium hover:bg-gray-300"
            onClick={handleReset}
          >
            Tailor Another
          </button>
        </div>
      )}

      {/* Error */}
      {stage === "error" && (
        <div class="space-y-2">
          <p class="text-sm text-red-600">{error}</p>
          <button
            class="w-full py-2 px-4 bg-gray-200 text-gray-700 rounded font-medium hover:bg-gray-300"
            onClick={handleReset}
          >
            Try Again
          </button>
        </div>
      )}
    </div>
  );
}
