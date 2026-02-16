export type Message =
  | { type: "EXTRACT_JOB_DESC" }
  | {
      type: "JOB_DESC_RESULT";
      payload: { title: string; company: string; description: string };
    }
  | { type: "START_TAILORING"; payload: { jobDescription: string; jobTitle: string; company: string } }
  | { type: "TAILORING_PROGRESS"; payload: { tabId: number; stage: string; pct: number } }
  | {
      type: "TAILORING_COMPLETE";
      payload: {
        tabId: number;
        pdfBase64?: string;
        texBase64?: string;
        filename: string;
      };
    }
  | { type: "TAILORING_ERROR"; payload: { tabId: number; error: string } }
  | { type: "TEST_API_KEY"; payload: { apiKey: string; provider: "gemini" | "anthropic" } }
  | { type: "GET_STATUS" }
  | { type: "OPEN_OPTIONS" }
  | { type: "GET_TAB_ID" }
  | { type: "FETCH_GREENHOUSE_JD"; payload: { board: string; jobId: string } }
  | { type: "GREENHOUSE_JD_RESULT"; payload: { title: string; company: string; description: string } | null }
  | {
      type: "DOWNLOAD_FILE";
      payload: {
        pdfBase64?: string;
        texBase64?: string;
        filename: string;
      };
    }
  | {
      type: "STATUS_RESULT";
      payload: {
        hasResume: boolean;
        hasApiKey: boolean;
      };
    };
