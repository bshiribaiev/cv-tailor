export interface ContactLink {
  text: string;
  url: string;
}

export interface Bullet {
  id: string;
  originalText: string;
  tailoredText?: string;
}

export interface SkillLine {
  label: string;
  items: string;
  tailoredItems?: string;
}

export interface Link {
  text: string;
  url: string;
}

export interface Entry {
  primaryTitle?: string;
  subtitle?: string;
  rightColumn?: string; // date + location for experience, links for projects
  dateRange?: string;
  location?: string;
  techStack?: string;
  links?: Link[];
  bullets: Bullet[];
  skillLines?: SkillLine[];
}

export type SectionType = "education" | "experience" | "projects" | "skills";

export interface Section {
  title: string;
  type: SectionType;
  entries: Entry[];
}

export interface Resume {
  name: string;
  contacts: ContactLink[];
  sections: Section[];
}
