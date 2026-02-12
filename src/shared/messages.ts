export type Message =
  | { type: "EXTRACT_JOB_DESC" }
  | {
      type: "JOB_DESC_RESULT";
      payload: { title: string; company: string; description: string };
    }
  | { type: "START_TAILORING"; payload: { jobDescription: string } }
  | { type: "TAILORING_PROGRESS"; payload: { stage: string; pct: number } }
  | {
      type: "TAILORING_COMPLETE";
      payload: {
        pdfBase64?: string;
        texBase64?: string;
        filename: string;
      };
    }
  | { type: "TAILORING_ERROR"; payload: { error: string } }
  | { type: "TEST_API_KEY"; payload: { apiKey: string; provider: "gemini" | "anthropic" } }
  | { type: "GET_STATUS" }
  | { type: "OPEN_OPTIONS" }
  | {
      type: "STATUS_RESULT";
      payload: {
        hasResume: boolean;
        hasApiKey: boolean;
      };
    };
