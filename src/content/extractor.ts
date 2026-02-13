/** Job description extraction — runs as injected function via chrome.scripting.executeScript */

export interface JobInfo {
  title: string;
  company: string;
  description: string;
}

export function extractJobDescription(): JobInfo {
  const host = window.location.hostname;

  // LinkedIn
  if (host.includes("linkedin.com")) {
    const descEl =
      document.querySelector<HTMLElement>(".jobs-description-content__text") ??
      document.querySelector<HTMLElement>(".description__text") ??
      document.querySelector<HTMLElement>('[class*="jobs-description"]');
    if (descEl) {
      const titleEl =
        document.querySelector<HTMLElement>(".job-details-jobs-unified-top-card__job-title") ??
        document.querySelector<HTMLElement>(".jobs-unified-top-card__job-title") ??
        document.querySelector<HTMLElement>("h1");
      const companyEl =
        document.querySelector<HTMLElement>(".job-details-jobs-unified-top-card__company-name") ??
        document.querySelector<HTMLElement>(".jobs-unified-top-card__company-name");
      return {
        title: titleEl?.textContent?.trim() ?? "",
        company: companyEl?.textContent?.trim() ?? "",
        description: descEl.innerText.trim(),
      };
    }
  }

  // Greenhouse (native or embedded via gh_jid param)
  const isGreenhouse =
    host.includes("greenhouse.io") ||
    host.includes("boards.greenhouse") ||
    new URLSearchParams(window.location.search).has("gh_jid") ||
    !!document.querySelector("#grnhse_app");
  if (isGreenhouse) {
    // Embedded Greenhouse renders inside #grnhse_app iframe or injected div
    const descEl =
      document.querySelector<HTMLElement>("#grnhse_app") ??
      document.querySelector<HTMLElement>("#content");
    if (descEl) {
      const titleEl =
        document.querySelector<HTMLElement>(".app-title") ??
        document.querySelector<HTMLElement>("h1");
      const companyEl = document.querySelector<HTMLElement>(".company-name");
      return {
        title: titleEl?.textContent?.trim() ?? "",
        company: companyEl?.textContent?.trim() ?? "",
        description: descEl.innerText.trim(),
      };
    }
  }

  // Lever
  if (host.includes("lever.co") || host.includes("jobs.lever")) {
    const descEl = document.querySelector<HTMLElement>(
      ".section-wrapper.page-full-width",
    );
    if (descEl) {
      const titleEl = document.querySelector<HTMLElement>(".posting-headline h2");
      const companyEl = document.querySelector<HTMLElement>(
        ".posting-categories .sort-by-team",
      );
      return {
        title: titleEl?.textContent?.trim() ?? "",
        company: companyEl?.textContent?.trim() ?? "",
        description: descEl.innerText.trim(),
      };
    }
  }

  // Workday
  if (host.includes("workday.com") || host.includes("myworkday")) {
    const descEl = document.querySelector<HTMLElement>(
      '[data-automation-id="jobPostingDescription"]',
    );
    if (descEl) {
      const titleEl = document.querySelector<HTMLElement>(
        '[data-automation-id="jobPostingHeader"]',
      );
      return {
        title: titleEl?.textContent?.trim() ?? "",
        company: "",
        description: descEl.innerText.trim(),
      };
    }
  }

  // Generic: find largest text block
  const candidates = document.querySelectorAll<HTMLElement>(
    "article, main, [role='main'], .content, .job-description, .description, #content, .posting-page",
  );

  let best: HTMLElement | null = null;
  let bestScore = 0;

  for (const el of candidates) {
    const score = el.innerText.length;
    if (score > bestScore) {
      bestScore = score;
      best = el;
    }
  }

  // Fallback: score all divs
  if (bestScore < 200) {
    const allEls = document.querySelectorAll<HTMLElement>("div, section, article");
    for (const el of allEls) {
      const tag = el.tagName.toLowerCase();
      const role = el.getAttribute("role") ?? "";
      if (
        ["nav", "header", "footer", "aside"].includes(tag) ||
        ["navigation", "banner", "contentinfo"].includes(role)
      )
        continue;

      let depth = 0;
      let cur: HTMLElement | null = el;
      while (cur?.parentElement) { depth++; cur = cur.parentElement; }

      const score = el.innerText.length * (1 / (1 + depth * 0.1));
      if (score > bestScore) {
        bestScore = score;
        best = el;
      }
    }
  }

  const h1 = document.querySelector<HTMLElement>("h1");
  return {
    title: h1?.textContent?.trim() ?? document.title,
    company: "",
    description: best?.innerText?.trim() ?? document.body.innerText.slice(0, 5000),
  };
}
