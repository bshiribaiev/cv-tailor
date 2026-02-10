import { jsPDF } from "jspdf";
import type { Resume, Section, Entry, Bullet, SkillLine } from "../parser/types";

// Points per cm
const CM = 28.3465;

// Page layout matching main.tex
const PAGE = {
  width: 612, // US Letter in points (8.5 * 72)
  height: 792, // US Letter in points (11 * 72)
  marginTop: 1 * CM,
  marginBottom: 0.5 * CM,
  marginLeft: 1.2 * CM,
  marginRight: 1.2 * CM,
};

const CONTENT_WIDTH = PAGE.width - PAGE.marginLeft - PAGE.marginRight;
const RIGHT_COL_WIDTH = 6.8 * CM;
const LEFT_COL_WIDTH = CONTENT_WIDTH - RIGHT_COL_WIDTH;

// Font sizes in pt (matching LaTeX 11pt base)
const FONT = {
  name: 18,
  normal: 10,
  large: 12.5,
  bullet: 10,
  contact: 10,
};

const LINE_HEIGHT = 1.25; // line height multiplier
const BULLET_INDENT = 0.4 * CM;
const BULLET_CHAR = "\u2022"; // bullet char
const ITEM_SEP = 0.1 * CM;

export async function generatePdf(resume: Resume): Promise<string> {
  const doc = new jsPDF({
    unit: "pt",
    format: "letter",
    putOnlyUsedFonts: true,
  });

  // Use Helvetica as fallback (Latin Modern TTF to be added later)
  // For now, use built-in fonts that are close enough
  const renderer = new ResumeRenderer(doc);
  renderer.render(resume);

  return doc.output("datauristring").split(",")[1]; // base64 only
}

class ResumeRenderer {
  private doc: jsPDF;
  private y: number;

  constructor(doc: jsPDF) {
    this.doc = doc;
    this.y = PAGE.marginTop;
  }

  render(resume: Resume) {
    this.renderName(resume.name);
    this.renderContacts(resume.contacts);
    this.addVSpace(0);

    for (const section of resume.sections) {
      this.renderSection(section);
    }
  }

  private renderName(name: string) {
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(FONT.name);
    const textWidth = this.doc.getTextWidth(name);
    const x = (PAGE.width - textWidth) / 2;
    this.doc.text(name, x, this.y);
    this.y += FONT.name * LINE_HEIGHT;
    this.addVSpace(0.1 * CM);
  }

  private renderContacts(
    contacts: { text: string; url: string }[],
  ) {
    this.doc.setFont("helvetica", "normal");
    this.doc.setFontSize(FONT.contact);

    const separator = "    ";
    const fullText = contacts.map((c) => c.text).join(separator);
    const totalWidth = this.doc.getTextWidth(fullText);
    let x = (PAGE.width - totalWidth) / 2;

    for (let i = 0; i < contacts.length; i++) {
      const contact = contacts[i];
      const w = this.doc.getTextWidth(contact.text);

      // Underline
      this.doc.setDrawColor(0, 0, 0);
      this.doc.setLineWidth(0.3);
      this.doc.line(x, this.y + 1.5, x + w, this.y + 1.5);

      // Text with link
      this.doc.textWithLink(contact.text, x, this.y, {
        url: contact.url,
      });

      x += w;
      if (i < contacts.length - 1) {
        x += this.doc.getTextWidth(separator);
      }
    }

    this.y += FONT.contact * LINE_HEIGHT;
    this.addVSpace(0);
  }

  private renderSection(section: Section) {
    this.addVSpace(0.3 * CM);
    this.checkPageBreak(3 * FONT.large);

    // Section header
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(FONT.large);
    this.doc.text(section.title, PAGE.marginLeft, this.y);
    this.y += 1; // small gap before rule
    // Horizontal rule
    this.doc.setDrawColor(0, 0, 0);
    this.doc.setLineWidth(0.5);
    this.doc.line(
      PAGE.marginLeft,
      this.y + 1,
      PAGE.width - PAGE.marginRight,
      this.y + 1,
    );
    this.y += 0.2 * CM;

    if (section.type === "skills") {
      this.renderSkills(section.entries[0]);
    } else {
      for (let i = 0; i < section.entries.length; i++) {
        if (section.type === "experience" || section.type === "education") {
          this.renderExperienceEntry(section.entries[i]);
        } else if (section.type === "projects") {
          this.renderProjectEntry(section.entries[i]);
        }

        // Space between entries
        if (i < section.entries.length - 1) {
          this.addVSpace(0.3 * CM);
        }
      }
    }
  }

  private renderExperienceEntry(entry: Entry) {
    this.checkPageBreak(4 * FONT.normal);

    // Line 1: Bold title (left) + Date (right)
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(FONT.normal);
    if (entry.primaryTitle) {
      this.doc.text(entry.primaryTitle, PAGE.marginLeft + 0.02 * CM, this.y);
    }

    if (entry.dateRange) {
      this.doc.setFont("helvetica", "normal");
      const dateWidth = this.doc.getTextWidth(entry.dateRange);
      this.doc.text(
        entry.dateRange,
        PAGE.width - PAGE.marginRight - dateWidth,
        this.y,
      );
    }
    this.y += FONT.normal * LINE_HEIGHT;

    // Line 2: Subtitle/company (left) + Location (right)
    if (entry.subtitle || entry.location) {
      this.doc.setFont("helvetica", "normal");
      this.doc.setFontSize(FONT.normal);
      if (entry.subtitle) {
        this.doc.text(entry.subtitle, PAGE.marginLeft + 0.02 * CM, this.y);
      }
      if (entry.location) {
        const locWidth = this.doc.getTextWidth(entry.location);
        this.doc.text(
          entry.location,
          PAGE.width - PAGE.marginRight - locWidth,
          this.y,
        );
      }
      this.y += FONT.normal * LINE_HEIGHT;
    }

    this.addVSpace(0.1 * CM);

    // Bullets
    this.renderBullets(entry.bullets);
  }

  private renderProjectEntry(entry: Entry) {
    this.checkPageBreak(4 * FONT.normal);

    // Left: Bold name | Italic tech stack
    this.doc.setFont("helvetica", "bold");
    this.doc.setFontSize(FONT.normal);
    const nameText = entry.primaryTitle ?? "";
    this.doc.text(nameText, PAGE.marginLeft + 0.02 * CM, this.y);
    let x = PAGE.marginLeft + 0.02 * CM + this.doc.getTextWidth(nameText);

    if (entry.techStack) {
      this.doc.setFont("helvetica", "normal");
      const sep = " | ";
      this.doc.text(sep, x, this.y);
      x += this.doc.getTextWidth(sep);

      this.doc.setFont("helvetica", "italic");
      this.doc.text(entry.techStack, x, this.y);
    }

    // Right: Links
    if (entry.links && entry.links.length > 0) {
      this.doc.setFont("helvetica", "normal");
      const linkTexts = entry.links.map((l) => l.text);
      const linkStr = linkTexts.join(" | ");
      const linkWidth = this.doc.getTextWidth(linkStr);
      const linkX = PAGE.width - PAGE.marginRight - linkWidth;

      let lx = linkX;
      for (let i = 0; i < entry.links.length; i++) {
        const link = entry.links[i];
        // Underline
        const w = this.doc.getTextWidth(link.text);
        this.doc.line(lx, this.y + 1.5, lx + w, this.y + 1.5);
        this.doc.textWithLink(link.text, lx, this.y, { url: link.url });
        lx += w;
        if (i < entry.links.length - 1) {
          const sepStr = " | ";
          this.doc.setFont("helvetica", "italic");
          this.doc.text(sepStr, lx, this.y);
          lx += this.doc.getTextWidth(sepStr);
          this.doc.setFont("helvetica", "normal");
        }
      }
    }

    this.y += FONT.normal * LINE_HEIGHT;
    this.addVSpace(0.1 * CM);

    // Bullets
    this.renderBullets(entry.bullets);
  }

  private renderBullets(bullets: Bullet[]) {
    this.doc.setFont("helvetica", "normal");
    this.doc.setFontSize(FONT.bullet);

    const bulletX = PAGE.marginLeft + BULLET_INDENT;
    const textX = bulletX + 8; // space after bullet char
    const maxWidth = PAGE.width - PAGE.marginRight - textX;

    for (const bullet of bullets) {
      const text = bullet.tailoredText ?? bullet.originalText;
      const lines = this.wrapText(text, maxWidth);

      this.checkPageBreak(lines.length * FONT.bullet * LINE_HEIGHT);

      // Bullet character
      this.doc.text(BULLET_CHAR, bulletX, this.y);

      // Wrapped lines
      for (let i = 0; i < lines.length; i++) {
        this.doc.text(lines[i], textX, this.y);
        this.y += FONT.bullet * LINE_HEIGHT;
      }

      this.y += ITEM_SEP;
    }
  }

  private renderSkills(entry: Entry) {
    if (!entry.skillLines) return;

    this.doc.setFontSize(FONT.normal);

    for (const skill of entry.skillLines) {
      this.checkPageBreak(FONT.normal * LINE_HEIGHT * 2);

      const x = PAGE.marginLeft + 0.02 * CM;

      // Bold label
      this.doc.setFont("helvetica", "bold");
      const label = skill.label + ": ";
      this.doc.text(label, x, this.y);
      const labelWidth = this.doc.getTextWidth(label);

      // Normal items
      this.doc.setFont("helvetica", "normal");
      const items = skill.tailoredItems ?? skill.items;
      const maxWidth = PAGE.width - PAGE.marginRight - x - labelWidth;
      const lines = this.wrapText(items, maxWidth);

      if (lines.length > 0) {
        this.doc.text(lines[0], x + labelWidth, this.y);
        this.y += FONT.normal * LINE_HEIGHT;

        for (let i = 1; i < lines.length; i++) {
          this.doc.text(lines[i], x, this.y);
          this.y += FONT.normal * LINE_HEIGHT;
        }
      } else {
        this.y += FONT.normal * LINE_HEIGHT;
      }

      this.addVSpace(0.1 * CM);
    }
  }

  private wrapText(text: string, maxWidth: number): string[] {
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let currentLine = "";

    for (const word of words) {
      const testLine = currentLine ? currentLine + " " + word : word;
      const testWidth = this.doc.getTextWidth(testLine);

      if (testWidth > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) lines.push(currentLine);

    return lines;
  }

  private checkPageBreak(neededHeight: number) {
    if (this.y + neededHeight > PAGE.height - PAGE.marginBottom) {
      this.doc.addPage();
      this.y = PAGE.marginTop;
    }
  }

  private addVSpace(space: number) {
    this.y += space;
  }
}
