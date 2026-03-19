import { NextRequest, NextResponse } from "next/server";

const DEFAULT_MODEL = "gemini-2.5-flash";

type CandidateContext = {
  name?: string;
  desired_position?: string;
  experience_summary?: string;
  ai_summary_markdown?: string;
  top_strengths?: string[];
  top_concerns?: string[];
  tags?: string[];
  work_history?: Array<{
    role?: string;
    company?: string;
    start?: string;
    end?: string;
    details?: string;
  }>;
  education?: Array<{
    program?: string;
    institution?: string;
    start?: string;
    end?: string;
    details?: string;
  }>;
  meeting_transcript_excerpt?: string;
  meeting_transcript_summary?: string;
};

const formatList = (items?: string[]) =>
  Array.isArray(items) && items.length > 0 ? items.join(", ") : "—";

const formatWorkHistory = (items?: CandidateContext["work_history"]) => {
  if (!Array.isArray(items) || items.length === 0) return "—";
  return items
    .map((item) => {
      const range = [item.start, item.end].filter(Boolean).join(" - ");
      const parts = [item.role, item.company].filter(Boolean).join(" @ ");
      return [parts, range, item.details].filter(Boolean).join(" | ");
    })
    .join("\n");
};

const formatEducation = (items?: CandidateContext["education"]) => {
  if (!Array.isArray(items) || items.length === 0) return "—";
  return items
    .map((item) => {
      const range = [item.start, item.end].filter(Boolean).join(" - ");
      const parts = [item.program, item.institution].filter(Boolean).join(" @ ");
      return [parts, range, item.details].filter(Boolean).join(" | ");
    })
    .join("\n");
};

const buildContext = (candidate: CandidateContext) => {
  return [
    `Name: ${candidate.name ?? "—"}`,
    `Desired position: ${candidate.desired_position ?? "—"}`,
    `Summary: ${candidate.experience_summary ?? "—"}`,
    `AI summary: ${candidate.ai_summary_markdown ?? "—"}`,
    `Top strengths: ${formatList(candidate.top_strengths)}`,
    `Top concerns: ${formatList(candidate.top_concerns)}`,
    `Tags: ${formatList(candidate.tags)}`,
    `Work history:\n${formatWorkHistory(candidate.work_history)}`,
    `Education:\n${formatEducation(candidate.education)}`,
    `Transcript summary: ${candidate.meeting_transcript_summary ?? "—"}`,
    `Transcript excerpt: ${candidate.meeting_transcript_excerpt ?? "—"}`,
  ].join("\n");
};

export async function POST(request: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  if (!apiKey) {
    return NextResponse.json({ error: "Missing GEMINI_API_KEY" }, { status: 500 });
  }

  const body = await request.json().catch(() => null);
  const question = typeof body?.question === "string" ? body.question.trim() : "";
  const candidate = (body?.candidate ?? {}) as CandidateContext;
  if (!question) {
    return NextResponse.json({ error: "Missing question." }, { status: 400 });
  }

  const context = buildContext(candidate);
  const prompt = [
    "You are a recruiting assistant. Answer the user's question using only the provided candidate context.",
    "If the answer is not in the context, say you don't have enough information.",
    "Be concise and include a short 'Evidence' line referencing which section you used (Summary, AI summary, Top concerns, Work history, Education, Transcript).",
    "",
    "Candidate context:",
    context,
    "",
    `Question: ${question}`,
  ].join("\n");

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }],
          },
        ],
      }),
    }
  );

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    return NextResponse.json(
      { error: data?.error?.message ?? "Failed to generate response." },
      { status: 500 }
    );
  }

  const text =
    data?.candidates?.[0]?.content?.parts?.[0]?.text ??
    data?.candidates?.[0]?.output_text ??
    "";
  return NextResponse.json({ answer: String(text).trim(), provider: "gemini" });
}
