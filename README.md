# CV Tailor

Chrome extension that tailors your LaTeX resume to job postings using AI. Browse a job listing, click the button, and get a tailored PDF — matching your exact LaTeX formatting.

![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-blue?logo=googlechrome&logoColor=white)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-green)
![Gemini API](https://img.shields.io/badge/Gemini-API-orange?logo=google&logoColor=white)

## How It Works

1. **Upload** your master `.tex` resume in the extension settings
2. **Browse** to any job posting (LinkedIn, Greenhouse, Lever, Workday, etc.)
3. **Click** the floating "Tailor Resume" button or open the extension popup
4. **Download** a tailored PDF with experience bullets reworded to match the job description

The extension extracts the job description from the page, sends your experience bullets to Gemini to incorporate relevant keywords, replaces the bullets in your raw `.tex` source, and compiles to PDF via an online LaTeX compiler — preserving your exact formatting, fonts, and layout.

## What Gets Tailored

- **Experience bullets** — reworded to naturally incorporate keywords from the job description
- Achievements, metrics, and numbers are preserved exactly
- Skills like Python, Java, Spring Boot, Next.js, LangGraph, C++, and Git are always included where relevant
- Projects, education, and skills sections remain untouched

## Features

- **One-click tailoring** from any job posting page
- **Floating button** auto-appears on supported job sites
- **Exact LaTeX output** — modifies `.tex` source directly, compiles with real LaTeX
- **Smart bullet formatting** — bullets fit cleanly on one or two lines, never dangling
- **Multiple Gemini models** — configurable (2.5 Flash, 2.5 Pro, 3 Flash, 2.5 Flash Lite)
- **Works offline-first** — resume and API key stored locally in Chrome

## Supported Job Sites

Auto-detected (floating button appears automatically):
- LinkedIn Jobs
- Greenhouse
- Lever
- Workday
- Ashby
- SmartRecruiters

The popup works on **any page** — it extracts job descriptions using smart DOM analysis.

## Setup

### Prerequisites

- Google Chrome
- [Gemini API key](https://aistudio.google.com/apikey) (free tier available)
- A `.tex` resume ([RenderCV](https://rendercv.com) template supported)

### Install

```bash
git clone https://github.com/bshiribaiev/cv-tailor.git
cd cv-tailor
npm install
npm run build
```

Then load the extension:

1. Open `chrome://extensions`
2. Enable **Developer mode** (toggle in top-right)
3. Click **Load unpacked** → select the `dist/` folder

### Configure

1. Click the extension icon → **Settings**
2. Enter your Gemini API key and click **Save & Test**
3. Upload your `.tex` file (or paste the content)
4. Click **Save Resume**

## Architecture

```
src/
  popup/          Popup UI (Preact + Tailwind)
  options/        Settings page
  background/
    service-worker.ts   Orchestration: extract → LLM → .tex replace → compile
    gemini.ts           Gemini API integration
  content/
    extractor.ts        Job description extraction
    floating-button.ts  Auto-injected button on job sites
  parser/
    latex-parser.ts     .tex → structured Resume object
    types.ts            Resume types
  shared/
    storage.ts          chrome.storage wrapper
    messages.ts         Message type definitions
```

**Pipeline:** Extract JD → Tailor bullets via Gemini → String-replace `\item` lines in `.tex` → Compile PDF via [latex.ytotech.com](https://latex.ytotech.com) → Download

## Tech Stack

- **Preact** + **Tailwind CSS** — lightweight UI
- **Vite** + **CRXJS** — Chrome extension build tooling
- **Gemini API** — raw fetch, JSON response mode
- **latex.ytotech.com** — online LaTeX → PDF compilation
- **TypeScript** throughout

## Development

```bash
npm run dev    # dev server with HMR
npm run build  # production build to dist/
```

Debug the service worker: `chrome://extensions` → CV Tailor → "Inspect views: service worker"

## License

ISC
