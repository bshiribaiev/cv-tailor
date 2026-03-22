# Privacy Policy — CV Tailor

**Last updated:** March 22, 2026

## What the extension does

CV Tailor is a Chrome extension that tailors your resume to job postings using AI. It extracts job description text from the current page, sends it along with your resume bullets to an LLM API, and returns a tailored resume.

## Data collection

CV Tailor does **not** collect, store, or transmit any personal data to the developer or any third party. There are no accounts, analytics, tracking, or telemetry.

## Data that stays on your device

- Your API key (stored in `chrome.storage.local`)
- Your uploaded `.tex` resume file
- Extension settings and preferences

All of the above remain in your browser's local storage and are never sent anywhere except as described below.

## Data sent to third-party APIs

When you tailor a resume, the extension sends the following directly from your browser to your chosen LLM provider:

- **Job description text** extracted from the current page
- **Resume bullet points** from your uploaded `.tex` file
- **Your API key** for authentication

Supported providers:
- **Anthropic** ([anthropic.com/privacy](https://www.anthropic.com/privacy))
- **Google Gemini** ([ai.google.dev/terms](https://ai.google.dev/terms))

Data is sent directly to these providers via their public APIs. CV Tailor does not proxy, log, or store any of this data.

The extension also sends your modified `.tex` content to **latex.ytotech.com** for PDF compilation. No API key or personal data is included in this request.

## Permissions

- **activeTab / scripting**: to extract job description text from the current page
- **storage**: to save your settings and resume locally
- **Host permissions**: to make API calls to Anthropic, Gemini, and the LaTeX compilation service

## Contact

If you have questions about this policy, open an issue at the project's GitHub repository.
