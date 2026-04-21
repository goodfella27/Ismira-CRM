import { canonicalizeCountry, getCountryCode } from "@/lib/country";

type CountryGroups = {
  processable: string[];
  blocked: string[];
  mentioned: string[];
  all: string[];
};

function uniquePreserveOrder(items: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    if (!item) continue;
    if (seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out;
}

export function flagEmojiToCountryCode(flag: string): string | null {
  const chars = Array.from(flag);
  if (chars.length !== 2) return null;
  const a = chars[0].codePointAt(0) ?? 0;
  const b = chars[1].codePointAt(0) ?? 0;
  const base = 0x1f1e6;
  const max = 0x1f1ff;
  if (a < base || a > max || b < base || b > max) return null;
  const first = String.fromCharCode(0x41 + (a - base));
  const second = String.fromCharCode(0x41 + (b - base));
  return `${first}${second}`;
}

export function extractCountryCodesFromText(text: string): string[] {
  const source = text ?? "";
  const matches = source.match(/[\u{1F1E6}-\u{1F1FF}]{2}/gu) ?? [];
  const codes = matches
    .map((flag) => flagEmojiToCountryCode(flag))
    .filter((code): code is string => Boolean(code));
  return uniquePreserveOrder(codes.map((code) => code.toUpperCase()));
}

function looksLikeHtml(value: string) {
  return /<\/?[a-z][\s\S]*>/i.test(value);
}

function stripHtmlToText(html: string) {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h1|h2|h3|h4|tr)>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+\n/g, "\n")
    .replace(/\n\s+/g, "\n")
    .trim();
}

function extractAttributeText(html: string) {
  const out: string[] = [];
  const re = /\b(?:alt|title|aria-label)\s*=\s*("([^"]*)"|'([^']*)')/gi;
  let match: RegExpExecArray | null = null;
  while ((match = re.exec(html))) {
    const value = (match[2] ?? match[3] ?? "").trim();
    if (value) out.push(value);
  }
  return out.join("\n");
}

function extractCountryCodesFromAttributeValues(html: string) {
  const codes: string[] = [];
  const re = /\b(?:alt|title|aria-label)\s*=\s*("([^"]*)"|'([^']*)')/gi;
  let match: RegExpExecArray | null = null;
  while ((match = re.exec(html))) {
    const value = (match[2] ?? match[3] ?? "").trim();
    if (!value) continue;
    const code = getCountryCode(value);
    if (code) codes.push(code);
    codes.push(...extractCountryCodesFromText(value));
  }
  return uniquePreserveOrder(codes.map((c) => c.toUpperCase()));
}

function extractCountryCodesFromImgSrc(html: string) {
  const codes: string[] = [];
  const re = /\bsrc\s*=\s*("([^"]+)"|'([^']+)')/gi;
  let match: RegExpExecArray | null = null;
  while ((match = re.exec(html))) {
    const raw = (match[2] ?? match[3] ?? "").trim();
    if (!raw) continue;
    try {
      const url = new URL(raw, "https://example.invalid");
      const path = url.pathname.toLowerCase();
      const file = path.split("/").pop() ?? "";
      const base = file.replace(/\.(svg|png|jpe?g|webp)$/i, "");
      if (/^[a-z]{2}$/i.test(base)) {
        codes.push(base.toUpperCase());
        continue;
      }
      const m =
        path.match(/(?:^|\/)([a-z]{2})\.(?:svg|png|jpe?g|webp)$/i) ??
        path.match(/\/flags\/([a-z]{2})(?:\/|$)/i) ??
        path.match(/\/flag\/([a-z]{2})(?:\/|$)/i);
      if (m?.[1]) codes.push(m[1].toUpperCase());
    } catch {
      // ignore
    }
  }
  return uniquePreserveOrder(codes);
}

function classifyLine(line: string) {
  const normalized = line.toLowerCase().replace(/\s+/g, " ").trim();
  const blocked =
    /can\s*not\s*process/.test(normalized) ||
    /cannot\s*process/.test(normalized) ||
    /can’t\s*process/.test(normalized) ||
    /can't\s*process/.test(normalized) ||
    /can\s*not\s*be\s*processed/.test(normalized) ||
    /cannot\s*be\s*processed/.test(normalized);
  const processable =
    !blocked &&
    (/nationalities\s+that\s+we\s+process/.test(normalized) ||
      /nationality\s+that\s+we\s+process/.test(normalized) ||
      /\bwe\s+process\b/.test(normalized));
  if (blocked) return "blocked";
  if (processable) return "processable";
  return "unknown";
}

export function extractNationalityCountryGroups(rawDescription: string): CountryGroups {
  const raw = (rawDescription ?? "").trim();
  if (!raw) return { processable: [], blocked: [], mentioned: [], all: [] };

  const combined = looksLikeHtml(raw)
    ? [stripHtmlToText(raw), extractAttributeText(raw)].filter(Boolean).join("\n")
    : raw;

  const all = uniquePreserveOrder([
    ...extractCountryCodesFromText(combined),
    ...(looksLikeHtml(raw) ? extractCountryCodesFromAttributeValues(raw) : []),
    ...(looksLikeHtml(raw) ? extractCountryCodesFromImgSrc(raw) : []),
  ]);
  if (all.length === 0) return { processable: [], blocked: [], mentioned: [], all: [] };

  const processable: string[] = [];
  const blocked: string[] = [];

  if (looksLikeHtml(raw)) {
    const source = raw;
    const processMatches = [
      ...source.matchAll(/nationalities[\s\S]{0,40}?process/gi),
      ...source.matchAll(/\bwe[\s\S]{0,20}?process\b/gi),
    ];
    for (const match of processMatches) {
      const start = Math.max(0, match.index ?? 0);
      const snippet = source.slice(start, start + 700);
      processable.push(
        ...uniquePreserveOrder([
          ...extractCountryCodesFromText(snippet),
          ...extractCountryCodesFromAttributeValues(snippet),
          ...extractCountryCodesFromImgSrc(snippet),
        ])
      );
    }

    const blockedMatches = [
      ...source.matchAll(/can\s*not[\s\S]{0,30}?process/gi),
      ...source.matchAll(/cannot[\s\S]{0,30}?process/gi),
      ...source.matchAll(/can['’]t[\s\S]{0,30}?process/gi),
    ];
    for (const match of blockedMatches) {
      const start = Math.max(0, match.index ?? 0);
      const snippet = source.slice(start, start + 700);
      blocked.push(
        ...uniquePreserveOrder([
          ...extractCountryCodesFromText(snippet),
          ...extractCountryCodesFromAttributeValues(snippet),
          ...extractCountryCodesFromImgSrc(snippet),
        ])
      );
    }
  }

  const lines = combined.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (const line of lines) {
    const codes = extractCountryCodesFromText(line);
    if (codes.length === 0) continue;
    const kind = classifyLine(line);
    if (kind === "processable") processable.push(...codes);
    else if (kind === "blocked") blocked.push(...codes);
  }

  const uniqueProcessable = uniquePreserveOrder(processable);
  const uniqueBlocked = uniquePreserveOrder(blocked);
  const mentionSet = new Set([...uniqueProcessable, ...uniqueBlocked]);
  const mentioned = all.filter((code) => !mentionSet.has(code));

  return {
    processable: uniqueProcessable,
    blocked: uniqueBlocked,
    mentioned,
    all,
  };
}

export type CountryRow = {
  country_code: string;
  country_name: string | null;
  group: "processable" | "blocked" | "mentioned";
};

export function buildCountryRows(groups: CountryGroups): CountryRow[] {
  const rows: CountryRow[] = [];
  const add = (code: string, group: CountryRow["group"]) => {
    const name = canonicalizeCountry(code) ?? null;
    rows.push({ country_code: code.toUpperCase(), country_name: name, group });
  };

  groups.processable.forEach((code) => add(code, "processable"));
  groups.blocked.forEach((code) => add(code, "blocked"));
  groups.mentioned.forEach((code) => add(code, "mentioned"));
  return rows;
}
