import type {
  Resume,
  Section,
  SectionType,
  Entry,
  Bullet,
  SkillLine,
  ContactLink,
  Link,
} from "./types";

let bulletCounter = 0;

function nextBulletId(): string {
  return `b${++bulletCounter}`;
}

/** Strip common LaTeX formatting commands, returning plain text */
export function stripLatex(text: string): string {
  let s = text;
  // \href{url}{text} or \hrefWithoutArrow{url}{text} → text
  s = s.replace(/\\(?:href|hrefWithoutArrow)\{[^}]*\}\{([^}]*)\}/g, "$1");
  // \textbf{text} → text
  s = s.replace(/\\textbf\{([^}]*)\}/g, "$1");
  // \textit{text} → text
  s = s.replace(/\\(?:textit|emph)\{([^}]*)\}/g, "$1");
  // \textnormal{text} → text
  s = s.replace(/\\textnormal\{([^}]*)\}/g, "$1");
  // \color{...}text — just remove the color command
  s = s.replace(/\\color\{[^}]*\}/g, "");
  // \textbar{} → |
  s = s.replace(/\\textbar\{\}/g, "|");
  // \& → &
  s = s.replace(/\\&/g, "&");
  // \% → %
  s = s.replace(/\\%/g, "%");
  // \$ → $
  s = s.replace(/\\\\?\$/g, "$");
  // \\ → (newline marker, strip)
  s = s.replace(/\\\\/g, " ");
  // \kern ... → space
  s = s.replace(/\\kern\s*[\d.]+\s*cm/g, " ");
  // \mbox{text} → text
  s = s.replace(/\\mbox\{([^}]*)\}/g, "$1");
  // \uline{text} → text
  s = s.replace(/\\uline\{([^}]*)\}/g, "$1");
  // \fontsize{...}{...}\selectfont → strip
  s = s.replace(/\\fontsize\{[^}]*\}\{[^}]*\}\\selectfont/g, "");
  // \vspace{...} → strip
  s = s.replace(/\\vspace\{[^}]*\}/g, "");
  // \AND → strip
  s = s.replace(/\\AND/g, "");
  // \normalsize → strip
  s = s.replace(/\\normalsize/g, "");
  // \raisebox{...}{text} → text
  s = s.replace(/\\raisebox\{[^}]*\}\{([^}]*)\}/g, "$1");
  // \footnotesize → strip
  s = s.replace(/\\footnotesize/g, "");
  // \faExternalLink* → strip
  s = s.replace(/\\faExternalLink\*/g, "");
  // Clean up multiple spaces
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

/** Extract href URLs from text */
function extractLinks(text: string): Link[] {
  const links: Link[] = [];
  const re = /\\(?:href|hrefWithoutArrow)\{([^}]*)\}\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(text))) {
    const url = m[1];
    let display = stripLatex(m[2]).trim();
    if (!display) display = url;
    links.push({ text: display, url });
  }
  return links;
}

/** Find matching closing brace for an opening brace at position */
function findMatchingBrace(text: string, openPos: number): number {
  let depth = 0;
  for (let i = openPos; i < text.length; i++) {
    if (text[i] === "{" && (i === 0 || text[i - 1] !== "\\")) depth++;
    if (text[i] === "}" && (i === 0 || text[i - 1] !== "\\")) depth--;
    if (depth === 0) return i;
  }
  return -1;
}

/** Extract content between \begin{env} and \end{env} */
function extractEnvContent(
  text: string,
  envName: string,
): { content: string; arg?: string; startIdx: number; endIdx: number }[] {
  const results: {
    content: string;
    arg?: string;
    startIdx: number;
    endIdx: number;
  }[] = [];
  const beginPattern = new RegExp(
    `\\\\begin\\{${envName}\\}`,
    "g",
  );
  const endStr = `\\end{${envName}}`;
  let m;
  while ((m = beginPattern.exec(text))) {
    const afterBegin = m.index + m[0].length;
    // Check for optional argument in brackets [...] or braces {...}
    let arg: string | undefined;
    let contentStart = afterBegin;

    // Check for [...] optional arg
    const afterWhitespace = text.slice(afterBegin).match(/^\s*/)?.[0]?.length ?? 0;
    const checkPos = afterBegin + afterWhitespace;

    if (text[checkPos] === "[") {
      const closeBracket = text.indexOf("]", checkPos);
      if (closeBracket !== -1) {
        contentStart = closeBracket + 1;
      }
    }

    // Check for {arg} after twocolentry
    if (envName === "twocolentry" && text[checkPos] === "{") {
      const closeIdx = findMatchingBrace(text, checkPos);
      if (closeIdx !== -1) {
        arg = text.slice(checkPos + 1, closeIdx);
        contentStart = closeIdx + 1;
      }
    }

    const endIdx = text.indexOf(endStr, contentStart);
    if (endIdx === -1) continue;

    results.push({
      content: text.slice(contentStart, endIdx).trim(),
      arg: arg?.trim(),
      startIdx: m.index,
      endIdx: endIdx + endStr.length,
    });
  }
  return results;
}

/** Parse \item lines from highlights environments */
function parseBullets(text: string): Bullet[] {
  const bullets: Bullet[] = [];
  // Find all highlights/highlightss environments
  const envs = [
    ...extractEnvContent(text, "highlights"),
    ...extractEnvContent(text, "highlightss"),
  ];

  for (const env of envs) {
    // Split by \item
    const items = env.content.split(/\\item\s+/).filter((s) => s.trim());
    for (const item of items) {
      const cleaned = stripLatex(item).trim();
      if (cleaned) {
        bullets.push({
          id: nextBulletId(),
          originalText: cleaned,
        });
      }
    }
  }
  return bullets;
}

/** Detect section type from title */
function sectionType(title: string): SectionType {
  const t = title.toUpperCase();
  if (t.includes("EDUCATION")) return "education";
  if (t.includes("EXPERIENCE")) return "experience";
  if (t.includes("PROJECT")) return "projects";
  if (t.includes("SKILL")) return "skills";
  return "experience"; // fallback
}

/** Parse the header block */
function parseHeader(headerContent: string): {
  name: string;
  contacts: ContactLink[];
} {
  // Name: \textbf{\fontsize{18 pt}{18 pt}\selectfont Bekbol Shiribaiev}
  const nameMatch = headerContent.match(
    /\\textbf\{(?:\\fontsize\{[^}]*\}\{[^}]*\}\\selectfont\s*)?([^}]+)\}/,
  );
  const name = nameMatch ? nameMatch[1].trim() : "";

  // Contacts: \mbox{\hrefWithoutArrow{url}{text}}
  const contacts: ContactLink[] = [];
  const contactRe =
    /\\(?:href|hrefWithoutArrow)\{([^}]*)\}\{(?:\\color\{[^}]*\})?([^}]*)\}/g;
  let m;
  while ((m = contactRe.exec(headerContent))) {
    contacts.push({
      url: m[1],
      text: m[2].trim(),
    });
  }

  return { name, contacts };
}

/** Parse Skills section */
function parseSkills(sectionContent: string): Entry {
  const skillLines: SkillLine[] = [];
  // Match \textbf{Label:} values or \textbf{Label \& more:} values
  const re = /\\textbf\{([^}]+)\}\s*(.*?)(?=\\textbf\{|$)/gs;
  let m;
  while ((m = re.exec(sectionContent))) {
    const label = stripLatex(m[1]).replace(/:$/, "").trim();
    const items = stripLatex(m[2]).trim();
    if (label && items) {
      skillLines.push({ label, items });
    }
  }
  return { bullets: [], skillLines };
}

/** Parse Experience/Education section entries */
function parseEntries(sectionContent: string, type: SectionType): Entry[] {
  if (type === "skills") {
    return [parseSkills(sectionContent)];
  }

  const entries: Entry[] = [];
  const twoCols = extractEnvContent(sectionContent, "twocolentry");

  // Group twocolentry pairs: for experience, first is title+company, could have a second for subtitle
  // For projects, each twocolentry is one project heading
  let i = 0;
  while (i < twoCols.length) {
    const tc = twoCols[i];
    const leftContent = tc.content;
    const rightContent = tc.arg || "";

    const entry: Entry = { bullets: [] };

    if (type === "experience") {
      // Left side has: \textbf{Title} \\ Company  or just \textbf{School}
      const titleMatch = leftContent.match(/\\textbf\{([^}]+)\}/);
      entry.primaryTitle = titleMatch ? stripLatex(titleMatch[1]) : "";

      // Company/org: text after \\ or after the textbf block
      const afterTitle = leftContent
        .replace(/\\textbf\{[^}]*\}/, "")
        .replace(/\\\\/, "")
        .trim();
      entry.subtitle = stripLatex(afterTitle) || undefined;

      // Right side: date range + location
      // Format: "{Aug 2025 – Present}\n\nNew York, NY"
      const rightClean = rightContent.replace(/^\{/, "").replace(/\}$/, "");
      const rightParts = rightClean.split(/\n/).map((s) => s.trim()).filter(Boolean);
      if (rightParts.length >= 1) {
        // First part might be wrapped in braces: {Aug 2025 – Present}
        entry.dateRange = stripLatex(rightParts[0].replace(/^\{/, "").replace(/\}$/, ""));
      }
      if (rightParts.length >= 2) {
        entry.location = stripLatex(rightParts[rightParts.length - 1]);
      }

      // Check if next twocolentry is a subtitle (e.g., degree line in education)
      if (type === "experience" && i + 1 < twoCols.length) {
        // Look ahead — if next twocolentry doesn't have \textbf, it's a subtitle
        const next = twoCols[i + 1];
        if (!next.content.includes("\\textbf{")) {
          entry.subtitle = stripLatex(next.content);
          // Right side of subtitle has date
          if (next.arg) {
            entry.dateRange = stripLatex(next.arg);
          }
          i++;
        }
      }
    } else if (type === "education") {
      const titleMatch = leftContent.match(/\\textbf\{([^}]+)\}/);
      entry.primaryTitle = titleMatch ? stripLatex(titleMatch[1]) : "";
      entry.location = stripLatex(rightContent);

      // Check for degree subtitle
      if (i + 1 < twoCols.length) {
        const next = twoCols[i + 1];
        if (!next.content.includes("\\textbf{")) {
          entry.subtitle = stripLatex(next.content);
          if (next.arg) entry.dateRange = stripLatex(next.arg);
          i++;
        }
      }
    } else if (type === "projects") {
      // Left: \textbf{Name} {\textbar{} \textit{Tech Stack}}
      const titleMatch = leftContent.match(/\\textbf\{([^}]+)\}/);
      entry.primaryTitle = titleMatch ? stripLatex(titleMatch[1]) : "";

      // Tech stack: \textit{...}
      const techMatch = leftContent.match(/\\textit\{([^}]+)\}/);
      entry.techStack = techMatch ? stripLatex(techMatch[1]) : undefined;

      // Right side: links
      entry.links = extractLinks(rightContent);
    }

    // Find bullets between this entry and the next (or end of section)
    const entryEndIdx = tc.endIdx;
    const nextEntryStart =
      i + 1 < twoCols.length ? twoCols[i + 1].startIdx : sectionContent.length;

    // Also check if next is a subtitle we already consumed
    const bulletRegion = sectionContent.slice(entryEndIdx, nextEntryStart);
    entry.bullets = parseBullets(bulletRegion);

    entries.push(entry);
    i++;
  }

  return entries;
}

/** Main parser: .tex string → Resume object */
export function parseLatex(tex: string): Resume {
  bulletCounter = 0;

  // Strip comments (lines starting with %)
  const lines = tex.split("\n");
  const noComments = lines
    .map((line) => {
      // Remove inline comments (but not escaped \%)
      const idx = line.search(/(?<!\\)%/);
      return idx >= 0 ? line.slice(0, idx) : line;
    })
    .join("\n");

  // Extract document body
  const bodyMatch = noComments.match(
    /\\begin\{document\}([\s\S]*)\\end\{document\}/,
  );
  const body = bodyMatch ? bodyMatch[1] : noComments;

  // Parse header
  const headerEnvs = extractEnvContent(body, "header");
  const { name, contacts } =
    headerEnvs.length > 0
      ? parseHeader(headerEnvs[0].content)
      : { name: "", contacts: [] };

  // Split by \section{...}
  const sectionRe = /\\section\{([^}]+)\}/g;
  const sectionMatches: { title: string; startIdx: number }[] = [];
  let m;
  while ((m = sectionRe.exec(body))) {
    sectionMatches.push({ title: m[1], startIdx: m.index + m[0].length });
  }

  const sections: Section[] = [];
  for (let i = 0; i < sectionMatches.length; i++) {
    const { title, startIdx } = sectionMatches[i];
    const endIdx =
      i + 1 < sectionMatches.length
        ? sectionMatches[i + 1].startIdx -
          `\\section{${sectionMatches[i + 1].title}}`.length
        : body.length;
    const content = body.slice(startIdx, endIdx);
    const type = sectionType(title);

    sections.push({
      title,
      type,
      entries: parseEntries(content, type),
    });
  }

  return { name, contacts, sections };
}
