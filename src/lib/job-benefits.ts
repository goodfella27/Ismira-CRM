export type BenefitTag =
  | "meals"
  | "accommodation"
  | "travel_tickets"
  | "visa_support"
  | "medical_exam"
  | "certification"
  | "bonus_tips"
  | "contract_length"
  | "growth"
  | "travel_opportunity";

export const AVAILABLE_BENEFIT_TAGS: BenefitTag[] = [
  "accommodation",
  "meals",
  "travel_tickets",
  "visa_support",
  "medical_exam",
  "certification",
  "bonus_tips",
  "contract_length",
  "growth",
  "travel_opportunity",
];

export const BENEFIT_TAG_LABELS: Record<BenefitTag, string> = {
  accommodation: "Accommodation",
  meals: "Free Meals",
  travel_tickets: "Tickets / Travel",
  visa_support: "Visa Support",
  medical_exam: "Paid Medical",
  certification: "Certification",
  bonus_tips: "Bonus / Tips",
  contract_length: "Stable Contract",
  growth: "Career Growth",
  travel_opportunity: "Travel Opportunity",
};

type BenefitRule = {
  tag: BenefitTag;
  score?: number;
  patterns: RegExp[];
};

const SECTION_KEYWORDS = [
  "benefit",
  "benefits",
  "conditions",
  "work conditions",
  "working conditions",
  "what company offers",
  "what we offer",
  "we offer",
  "our offer",
  "offer",
  "package",
  "perks",
  "compensation",
  "why join",
];

const BENEFIT_RULES: BenefitRule[] = [
  {
    tag: "accommodation",
    patterns: [/\baccommodation\b/i, /\bhousing\b/i, /\bhotel\b/i, /\bcabin\b/i],
    score: 6,
  },
  {
    tag: "meals",
    patterns: [/\bmeal(s)?\b/i, /\bfood\b/i, /\bfree\s+food\b/i, /\bcatering\b/i],
    score: 6,
  },
  {
    tag: "travel_tickets",
    patterns: [
      /\b(ticket|tickets|airfare|flight|flights)\b/i,
      /\bjoining\s+(ticket|tickets)\b/i,
      /\btravel\s+expenses\b/i,
      /\breimburse(d|ment)?\b/i,
      /\btransfers?\b/i,
      /\btransport\b/i,
    ],
    score: 5,
  },
  {
    tag: "visa_support",
    patterns: [/\bvisa(s)?\b/i, /\bschengen\b/i, /\bwork\s+permit\b/i],
    score: 4,
  },
  {
    tag: "medical_exam",
    patterns: [/\bmedical\b/i, /\bpeme\b/i, /\bpre[-\s]?employment\b/i],
    score: 4,
  },
  {
    tag: "certification",
    patterns: [
      /\bstcw\b/i,
      /\bcertificate\b/i,
      /\bcertification\b/i,
      /\btraining\b/i,
      /\bcourse\b/i,
    ],
    score: 3,
  },
  {
    tag: "bonus_tips",
    patterns: [/\bbonus\b/i, /\btips?\b/i, /\bcommission\b/i],
    score: 3,
  },
  {
    tag: "contract_length",
    patterns: [/\bcontract\b/i, /\bmonths?\b/i, /\bmonth\b/i],
    score: 2,
  },
  {
    tag: "growth",
    patterns: [/\bgrow\b/i, /\bcareer\b/i, /\bdevelopment\b/i, /\bpromot/i],
    score: 2,
  },
  {
    tag: "travel_opportunity",
    patterns: [/\bopportunity\s+to\s+travel\b/i, /\btravel\s+to\s+the\s+ports?\b/i],
    score: 2,
  },
];

const DEFAULT_MAX_TAGS = 6;

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function stripHtmlToText(html: string) {
  const normalized = (html ?? "").toString();
  if (!normalized.trim()) return "";

  return (
    normalized
      .replace(/<\/(p|div|section|article|h[1-6])>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<li[^>]*>/gi, "\n- ")
      .replace(/<\/li>/gi, "\n")
      .replace(/<\/(ul|ol)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/[ \t\r\f\v]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

function looksLikeHeading(line: string) {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (trimmed.length > 80) return false;
  if (/[.!?]$/.test(trimmed)) return false;

  const noBullet = trimmed.replace(/^[-•\u2022]+\s*/, "");
  if (/:\s*$/.test(noBullet)) return true;

  const letters = noBullet.replace(/[^A-Za-z]/g, "");
  if (letters.length >= 6) {
    const upper = letters.replace(/[^A-Z]/g, "").length;
    if (upper / letters.length > 0.82) return true;
  }
  return false;
}

function isBenefitSectionHeading(line: string) {
  const cleaned = line.replace(/^[-•\u2022]+\s*/, "").replace(/:\s*$/, "");
  const lower = cleaned.trim().toLowerCase();
  if (!lower) return false;
  return SECTION_KEYWORDS.some((keyword) => lower.includes(keyword));
}

function extractBenefitCandidateLines(descriptionHtml: string) {
  const text = stripHtmlToText(descriptionHtml);
  if (!text) return [];

  const lines = text
    .split("\n")
    .map((line) => normalizeWhitespace(line))
    .map((line) => line.replace(/^\u00b7\s*/, "- "))
    .filter(Boolean);

  const collected: string[] = [];
  let inSection = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (looksLikeHeading(trimmed) && isBenefitSectionHeading(trimmed)) {
      inSection = true;
      continue;
    }

    if (looksLikeHeading(trimmed) && !isBenefitSectionHeading(trimmed)) {
      inSection = false;
      continue;
    }

    if (!inSection) continue;

    const normalizedLine = trimmed.replace(/^[-•\u2022]+\s*/, "");
    if (normalizedLine.length < 3) continue;
    collected.push(normalizedLine);
  }

  return collected;
}

function scoreTagsFromText(lines: string[]) {
  const scores = new Map<BenefitTag, number>();
  for (const line of lines) {
    for (const rule of BENEFIT_RULES) {
      if (rule.patterns.some((pattern) => pattern.test(line))) {
        const next = (scores.get(rule.tag) ?? 0) + (rule.score ?? 1);
        scores.set(rule.tag, next);
      }
    }
  }
  return scores;
}

function sortTags(scores: Map<BenefitTag, number>) {
  return Array.from(scores.entries())
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0]);
    })
    .map(([tag]) => tag);
}

export function extractBenefitTagsFromDescription(
  descriptionHtml: string,
  options?: { maxTags?: number }
) {
  const maxTags = Math.max(1, options?.maxTags ?? DEFAULT_MAX_TAGS);
  const candidates = extractBenefitCandidateLines(descriptionHtml);
  const fallbackText = stripHtmlToText(descriptionHtml);
  const fallbackLines = fallbackText ? fallbackText.split(/\n+/).map(normalizeWhitespace).filter(Boolean) : [];
  const lines = candidates.length > 0 ? candidates : fallbackLines;
  const scores = scoreTagsFromText(lines);
  return sortTags(scores).slice(0, maxTags);
}

export function summarizeCompanyBenefits(
  positions: Array<{ company: string; benefitTags: BenefitTag[] }>,
  options?: { maxTags?: number }
) {
  const maxTags = Math.max(1, options?.maxTags ?? DEFAULT_MAX_TAGS);
  const byCompany = new Map<string, Map<BenefitTag, number>>();

  for (const position of positions) {
    const company = (position.company ?? "").trim();
    if (!company) continue;
    const bucket = byCompany.get(company) ?? new Map<BenefitTag, number>();
    for (const tag of position.benefitTags) {
      bucket.set(tag, (bucket.get(tag) ?? 0) + 1);
    }
    byCompany.set(company, bucket);
  }

  return Array.from(byCompany.entries())
    .map(([company, counts]) => ({
      company,
      tags: sortTags(counts).slice(0, maxTags),
      counts: Object.fromEntries(Array.from(counts.entries())) as Record<BenefitTag, number>,
    }))
    .sort((a, b) => a.company.localeCompare(b.company));
}
