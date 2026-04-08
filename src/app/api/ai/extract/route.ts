import { NextRequest, NextResponse } from "next/server";
import { COUNTRY_NAME_TO_CODE, canonicalizeCountry } from "@/lib/country";

const DEFAULT_MODEL = "gemini-2.5-flash";

function getGeminiConfig() {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;

  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY");
  }

  return { apiKey, model };
}

const responseSchema = {
  type: "object",
  properties: {
    summary: { type: "string" },
    next_steps: { type: "string" },
    fields: {
      type: "object",
      properties: {
        full_name: { type: ["string", "null"] },
        email: { type: ["string", "null"] },
        phone: { type: ["string", "null"] },
        nationality: { type: ["string", "null"] },
        current_city: { type: ["string", "null"] },
        current_country: { type: ["string", "null"] },
        desired_position: { type: ["string", "null"] },
        english_level: { type: ["string", "null"] },
        experience_summary: { type: ["string", "null"] },
        education: { type: ["string", "null"] },
        strengths: {
          type: "array",
          items: { type: "string" },
        },
        concerns: {
          type: "array",
          items: { type: "string" },
        },
        tags: {
          type: "array",
          items: { type: "string" },
        },
        years_experience: { type: ["number", "null"] },
        availability_date: { type: ["string", "null"] },
        salary_expectation: { type: ["string", "null"] },
        documents: {
          type: "object",
          properties: {
            passport: { type: "string" },
            seaman_book: { type: "string" },
            medical: { type: "string" },
            certificates: {
              type: "array",
              items: { type: "string" },
            },
          },
          required: ["passport", "seaman_book", "medical", "certificates"],
        },
        red_flags: {
          type: "array",
          items: { type: "string" },
        },
        next_step_recommendation: { type: ["string", "null"] },
      },
      required: [
        "full_name",
        "email",
        "phone",
        "nationality",
        "current_city",
        "current_country",
        "desired_position",
        "english_level",
        "experience_summary",
        "education",
        "strengths",
        "concerns",
        "tags",
        "years_experience",
        "availability_date",
        "salary_expectation",
        "documents",
        "red_flags",
        "next_step_recommendation",
      ],
    },
    confidence: {
      type: "object",
      properties: {
        full_name: { type: "string" },
        email: { type: "string" },
        phone: { type: "string" },
        desired_position: { type: "string" },
        english_level: { type: "string" },
        experience_summary: { type: "string" },
        education: { type: "string" },
        years_experience: { type: "string" },
      },
      required: [
        "full_name",
        "email",
        "phone",
        "desired_position",
        "english_level",
        "experience_summary",
        "education",
        "years_experience",
      ],
    },
    evidence: {
      type: "object",
      properties: {
        full_name: { type: ["string", "null"] },
        email: { type: ["string", "null"] },
        phone: { type: ["string", "null"] },
        desired_position: { type: ["string", "null"] },
        english_level: { type: ["string", "null"] },
        experience_summary: { type: ["string", "null"] },
        education: { type: ["string", "null"] },
        years_experience: { type: ["string", "null"] },
      },
      required: [
        "full_name",
        "email",
        "phone",
        "desired_position",
        "english_level",
        "experience_summary",
        "education",
        "years_experience",
      ],
    },
  },
  required: ["summary", "next_steps", "fields", "confidence", "evidence"],
} as const;

const COUNTRY_ALIASES = Array.from(
  new Set([
    ...Object.keys(COUNTRY_NAME_TO_CODE),
    "the states",
    "states",
    "u.s.",
    "u.s.a.",
  ])
);

const escapeRegex = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const COUNTRY_PATTERN = COUNTRY_ALIASES.map(escapeRegex)
  .sort((a, b) => b.length - a.length)
  .join("|");

const NATIONALITY_REGEX = new RegExp(
  `\\b(?:from|born in|grew up in|raised in|originally from|citizen of|nationality(?: is|:)?|passport(?: is|:)?)\\s+(?:the\\s+)?(${COUNTRY_PATTERN})\\b`,
  "i"
);

const CURRENT_COUNTRY_REGEXES = [
  new RegExp(
    `\\b(?:live in|living in|based in|currently in|now in|relocating to|relocating in|moving to|moved to|move to|coming to|come to)\\s+(?:the\\s+)?(${COUNTRY_PATTERN})\\b`,
    "i"
  ),
  new RegExp(`\\bin\\s+the\\s+(${COUNTRY_PATTERN})\\b`, "i"),
];

type CountryInference = {
  nationality?: { value: string; evidence: string };
  current_country?: { value: string; evidence: string };
  mentions: Array<{ value: string; evidence: string }>;
};

const collectMentions = (text: string): Array<{ value: string; evidence: string }> => {
  const mentions: Array<{ value: string; evidence: string }> = [];
  const regex = new RegExp(`\\b(?:the\\s+)?(${COUNTRY_PATTERN})\\b`, "gi");
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text))) {
    const raw = match[1];
    if (!raw) continue;
    const canonical = canonicalizeCountry(raw);
    if (!canonical) continue;
    const start = Math.max(0, match.index - 40);
    const end = Math.min(text.length, match.index + raw.length + 40);
    const snippet = text.slice(start, end).trim();
    mentions.push({ value: canonical, evidence: snippet });
  }
  return mentions;
};

const inferCountries = (text: string): CountryInference => {
  const inference: CountryInference = { mentions: [] };
  const nationalityMatch = text.match(NATIONALITY_REGEX);
  if (nationalityMatch?.[1]) {
    const canonical = canonicalizeCountry(nationalityMatch[1]);
    if (canonical) {
      inference.nationality = {
        value: canonical,
        evidence: nationalityMatch[0]?.trim() ?? canonical,
      };
    }
  }

  for (const regex of CURRENT_COUNTRY_REGEXES) {
    const currentMatch = text.match(regex);
    if (currentMatch?.[1]) {
      const canonical = canonicalizeCountry(currentMatch[1]);
      if (canonical) {
        inference.current_country = {
          value: canonical,
          evidence: currentMatch[0]?.trim() ?? canonical,
        };
      }
      break;
    }
  }

  inference.mentions = collectMentions(text);
  return inference;
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { transcript?: string; language?: string };
    const transcript = body.transcript?.trim();

    if (!transcript) {
      return NextResponse.json({ error: "Missing transcript" }, { status: 400 });
    }

    const { apiKey, model } = getGeminiConfig();

    const systemPrompt = `You are an expert recruiter assistant. Extract structured candidate data from the transcript.
Rules:
- Only use information present in the transcript.
- If a field is unknown, return null (or empty array for lists).
- Keep summaries concise and factual.
- Prioritize: full_name, desired_position, email, phone, summary, experience_summary, education.
- Extract nationality and current_country if explicitly mentioned; do not guess.
- Also extract top 3 strengths and top 3 concerns from the transcript.
  - Return arrays "strengths" and "concerns" with up to 3 items each.
  - If not enough evidence, return an empty array.
- Also extract tags for filtering.
  - Return array "tags" with 3-10 short tags (lowercase, 1-3 words).
  - Only include tags explicitly supported by the transcript (no guessing).
  - Use this tag vocabulary when applicable:
    - Role/Department: waitress, bartender, housekeeping, guest service, casino, spa, culinary
    - Industry/Venue: cruise, hotel, restaurant, casino
    - Language/Communication: english:good, english:average, english:excellent, spanish
    - Experience Level: senior, junior, 3+ years, manager
    - Availability: immediate, 2-weeks, flexible
    - Certifications/Documents: stcw, seaman-book, passport-ready, medical
    - Location/Mobility: based:<country>, willing-to-relocate
    - Interview Flags: strong-communication, needs-training, red-flag
  - Gender tags (male/female) only if explicitly stated by the candidate.
- Examples:
  - "I grew up in China" => nationality: China
  - "I moved to the States" => current_country: United States
  - "I was born in Portugal and now live in the UK" => nationality: Portugal, current_country: United Kingdom
- Summary must be Markdown with this structure:
  - "### Summary of Interview with <full_name>" (or "Candidate" if name unknown)
  - 1 short overview paragraph.
  - "#### Key Information and Insights" with bullet points.
  - If timestamps are present in the transcript (e.g. 00:00, 01:23, 00:10:45), include a "#### Timeline of Interview Flow" table with columns Time | Topic | Details. Use only timestamps found in the transcript. Each row must be on its own line using pipe-separated Markdown (e.g. "| 00:32 | About Yourself | ... |"). If no timestamps exist, omit this section.
  - "#### Key Takeaways" with bullet points.
  - Use blank lines between sections. Each heading must be on its own line.
  - Do not add HTML, only Markdown.
- Education: include degrees/programs/institutions (e.g. "Master of Education, Lake Erie College").
- Keep education separate from experience_summary; if both are present, populate both.
- dates: prefer ISO YYYY-MM-DD when possible.
- documents: use one of present|missing|unknown.
- confidence values: high|medium|low.
- evidence values: short direct snippets from the transcript (or null if unknown).
`;

    const userPrompt = `Transcript:\n${transcript}`;

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    const requestBody = JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: `${systemPrompt}\n${userPrompt}` }],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
        responseJsonSchema: responseSchema,
      },
    });

    const sleep = (ms: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, ms));

    let res: Response | null = null;
    let data: any = null;
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: requestBody,
      });

      data = await res.json().catch(() => null);

      if (res.ok) break;
      const retryable = res.status === 429 || res.status === 500 || res.status === 503;
      if (!retryable || attempt === maxAttempts) break;
      await sleep(250 * attempt * attempt);
    }

    if (!res || !res.ok) {
      const status = res?.status ?? 500;
      const message =
        data?.error?.message ??
        data?.error?.status ??
        data?.message ??
        "Gemini request failed";

      return NextResponse.json(
        {
          error: message,
          status,
          details: data,
        },
        { status }
      );
    }

    const text =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ??
      data?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data ??
      null;

    if (!text) {
      return NextResponse.json(
        {
          error: "Gemini response missing content",
          details: data,
        },
        { status: 500 }
      );
    }

    const parsed = typeof text === "string" ? JSON.parse(text) : text;

    const profile = parsed as Record<string, unknown>;
    const fields = (profile?.fields ?? {}) as Record<string, unknown>;
    const evidence = (profile?.evidence ?? {}) as Record<string, unknown>;
    const confidence = (profile?.confidence ?? {}) as Record<string, unknown>;
    const inferred = inferCountries(transcript);

    if (!fields.nationality && inferred.nationality) {
      fields.nationality = inferred.nationality.value;
      evidence.nationality = inferred.nationality.evidence;
      confidence.nationality = confidence.nationality ?? "low";
    }

    if (!fields.current_country && inferred.current_country) {
      fields.current_country = inferred.current_country.value;
      evidence.current_country = inferred.current_country.evidence;
      confidence.current_country = confidence.current_country ?? "low";
    }

    if (!fields.nationality && inferred.mentions.length === 1) {
      fields.nationality = inferred.mentions[0].value;
      evidence.nationality = inferred.mentions[0].evidence;
      confidence.nationality = confidence.nationality ?? "low";
    }

    if (!Array.isArray(fields.tags)) {
      fields.tags = [];
    }

    profile.fields = fields;
    profile.evidence = evidence;
    profile.confidence = confidence;

    if (!fields.education) {
      const match = transcript.match(
        /[^.?!]*\b(bachelor|bachelors|master|masters|phd|doctorate|degree|university|college|school|diploma|certificate|certification)\b[^.?!]*[.?!]?/i
      );
      if (match && match[0]) {
        fields.education = match[0].trim();
        evidence.education = match[0].trim();
        confidence.education = confidence.education ?? "low";
        profile.fields = fields;
        profile.evidence = evidence;
        profile.confidence = confidence;
      }
    }

    return NextResponse.json({ profile, usage: data?.usageMetadata ?? null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
