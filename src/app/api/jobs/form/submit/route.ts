import { NextResponse } from "next/server";

import { breezyFetch, findCandidatesByEmail, requireBreezyIds } from "@/lib/breezy";

export const runtime = "nodejs";

const NAME_PATTERN = /^[A-Za-z][A-Za-z' -]{0,79}$/;
const TEXT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 ,.()&/'+\-]{1,119}$/;
const PHONE_PATTERN = /^[0-9+()\- ]{7,24}$/;
const ALLOWED_FILE_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
const MAX_CV_BYTES = 8 * 1024 * 1024;

const DEPARTMENT_OPTIONS = ["Hotel", "Technical"] as const;
const EXPERIENCE_OPTIONS = [
  "Ship or land-based experience (2+ years)",
  "Some experience (under 2 years)",
  "No direct experience",
] as const;
const ENGLISH_LEVEL_OPTIONS = [
  "Basic",
  "Intermediate",
  "Upper-Intermediate",
  "Advanced",
  "Fluent",
] as const;
const YES_NO_OPTIONS = ["Yes", "No"] as const;

function asString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function isAllowedName(value: string) {
  return NAME_PATTERN.test(value);
}

function isAllowedText(value: string) {
  return TEXT_PATTERN.test(value);
}

function isAllowedOption<T extends readonly string[]>(value: string, options: T): value is T[number] {
  return options.includes(value as T[number]);
}

function extractCandidateId(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const record = payload as Record<string, unknown>;
  const direct = typeof record._id === "string" ? record._id : typeof record.id === "string" ? record.id : "";
  if (direct) return direct.trim();
  if (record.data && typeof record.data === "object") {
    const nested = record.data as Record<string, unknown>;
    return typeof nested._id === "string"
      ? nested._id.trim()
      : typeof nested.id === "string"
        ? nested.id.trim()
        : "";
  }
  return "";
}

function extractErrorMessage(payload: unknown, fallback: string) {
  if (typeof payload === "string" && payload.trim()) return payload.trim();
  if (!payload || typeof payload !== "object") return fallback;
  const record = payload as Record<string, unknown>;
  const direct =
    (typeof record.message === "string" && record.message.trim()) ||
    (typeof record.error === "string" && record.error.trim()) ||
    (typeof record.details === "string" && record.details.trim()) ||
    "";
  if (direct) return direct;
  if (record.errors && Array.isArray(record.errors)) {
    const first = record.errors.find((item) => typeof item === "string" && item.trim());
    if (typeof first === "string") return first.trim();
  }
  return fallback;
}

function buildCandidatePayload(input: {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  department: (typeof DEPARTMENT_OPTIONS)[number];
  desiredPosition: string;
  experience: (typeof EXPERIENCE_OPTIONS)[number];
  isAdult: (typeof YES_NO_OPTIONS)[number];
  citizenship: string;
  englishLevel: (typeof ENGLISH_LEVEL_OPTIONS)[number];
}) {
  const fullName = `${input.firstName} ${input.lastName}`.trim();

  return {
    name: fullName,
    email_address: input.email,
    phone_number: input.phone,
    source: "ISMIRA Jobs Form",
    origin: "applied",
    summary: [
      `Department: ${input.department}`,
      `Desired position: ${input.desiredPosition}`,
      `Experience: ${input.experience}`,
      `18+ confirmed: ${input.isAdult}`,
      `Citizenship: ${input.citizenship}`,
      `English level: ${input.englishLevel}`,
    ].join("\n"),
    custom_attributes: [
      { name: "Department", value: input.department, secure: false },
      { name: "Desired Position", value: input.desiredPosition, secure: false },
      { name: "Experience", value: input.experience, secure: false },
      { name: "Adult Confirmed", value: input.isAdult, secure: false },
      { name: "Citizenship", value: input.citizenship, secure: false },
      { name: "English Level", value: input.englishLevel, secure: false },
    ],
  };
}

async function uploadResumeToBreezy(params: {
  companyId: string;
  positionId: string;
  candidateId: string;
  file: File;
}) {
  const resumeForm = new FormData();
  resumeForm.set("file", params.file, params.file.name);

  const resumeUrl = `https://api.breezy.hr/v3/company/${encodeURIComponent(
    params.companyId
  )}/position/${encodeURIComponent(params.positionId)}/candidate/${encodeURIComponent(
    params.candidateId
  )}/resume`;

  let res = await breezyFetch(resumeUrl, {
    method: "POST",
    body: resumeForm,
  });

  if (!res.ok) {
    const documentUrl = `https://api.breezy.hr/v3/company/${encodeURIComponent(
      params.companyId
    )}/position/${encodeURIComponent(params.positionId)}/candidate/${encodeURIComponent(
      params.candidateId
    )}/documents`;
    const documentsForm = new FormData();
    documentsForm.set("file", params.file, params.file.name);
    res = await breezyFetch(documentUrl, {
      method: "POST",
      body: documentsForm,
    });
  }

  if (!res.ok) {
    const contentType = res.headers.get("content-type") ?? "";
    const body = contentType.includes("application/json") ? await res.json().catch(() => null) : await res.text().catch(() => "");
    throw new Error(
      typeof body === "string"
        ? body || "Resume upload failed"
        : (body as { message?: string; error?: string } | null)?.message ??
            (body as { message?: string; error?: string } | null)?.error ??
            "Resume upload failed"
    );
  }
}

async function createCandidateFromResume(params: {
  companyId: string;
  positionId: string;
  file: File;
}) {
  const uploadForm = new FormData();
  uploadForm.set("file", params.file, params.file.name);

  const createUrl = `https://api.breezy.hr/v3/company/${encodeURIComponent(
    params.companyId
  )}/position/${encodeURIComponent(params.positionId)}/candidates/resume`;

  const res = await breezyFetch(createUrl, {
    method: "POST",
    body: uploadForm,
  });
  const contentType = res.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json")
    ? await res.json().catch(() => null)
    : await res.text().catch(() => "");

  if (!res.ok) {
    throw new Error(extractErrorMessage(body, "Failed to create Breezy candidate from resume."));
  }

  const candidateId = extractCandidateId(body);
  if (!candidateId) {
    throw new Error("Breezy did not return a candidate id after resume upload.");
  }
  return candidateId;
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const { companyId, positionId: defaultPositionId } = requireBreezyIds();

    const firstName = asString(formData.get("firstName"));
    const lastName = asString(formData.get("lastName"));
    const email = asString(formData.get("email")).toLowerCase();
    const phone = asString(formData.get("phone"));
    const department = asString(formData.get("department"));
    const desiredPosition = asString(formData.get("desiredPosition"));
    const experience = asString(formData.get("experience"));
    const isAdult = asString(formData.get("isAdult"));
    const citizenship = asString(formData.get("citizenship"));
    const englishLevel = asString(formData.get("englishLevel"));
    const positionId = asString(formData.get("positionId")) || defaultPositionId;
    const consent = asString(formData.get("consent"));
    const cvFile = formData.get("cv");

    if (!positionId) {
      return NextResponse.json({ error: "Missing Breezy position configuration." }, { status: 500 });
    }
    if (!firstName || !lastName || !email || !phone || !department || !desiredPosition || !experience || !isAdult || !citizenship || !englishLevel) {
      return NextResponse.json({ error: "Please fill in all required fields." }, { status: 400 });
    }
    if (consent !== "yes") {
      return NextResponse.json({ error: "Privacy consent is required." }, { status: 400 });
    }
    if (!isAllowedName(firstName) || !isAllowedName(lastName)) {
      return NextResponse.json({ error: "Name fields must use English letters only." }, { status: 400 });
    }
    if (!isAllowedText(desiredPosition)) {
      return NextResponse.json({ error: "Desired position must use English characters only." }, { status: 400 });
    }
    if (!PHONE_PATTERN.test(phone)) {
      return NextResponse.json({ error: "Please enter a valid phone number." }, { status: 400 });
    }
    if (!isAllowedOption(department, DEPARTMENT_OPTIONS)) {
      return NextResponse.json({ error: "Invalid department option." }, { status: 400 });
    }
    if (!isAllowedOption(experience, EXPERIENCE_OPTIONS)) {
      return NextResponse.json({ error: "Invalid experience option." }, { status: 400 });
    }
    if (!isAllowedOption(isAdult, YES_NO_OPTIONS) || isAdult !== "Yes") {
      return NextResponse.json({ error: "Applicant must confirm they are at least 18 years old." }, { status: 400 });
    }
    if (!isAllowedOption(englishLevel, ENGLISH_LEVEL_OPTIONS)) {
      return NextResponse.json({ error: "Invalid English level option." }, { status: 400 });
    }
    if (!(cvFile instanceof File) || cvFile.size <= 0) {
      return NextResponse.json({ error: "CV upload is required." }, { status: 400 });
    }
    if (cvFile.size > MAX_CV_BYTES) {
      return NextResponse.json({ error: "CV file is too large. Maximum size is 8MB." }, { status: 400 });
    }
    if (cvFile.type && !ALLOWED_FILE_TYPES.has(cvFile.type)) {
      return NextResponse.json({ error: "CV must be PDF, DOC, or DOCX." }, { status: 400 });
    }

    const candidatePayload = buildCandidatePayload({
      firstName,
      lastName,
      email,
      phone,
      department,
      desiredPosition,
      experience,
      isAdult,
      citizenship,
      englishLevel,
    });

    const existing = await findCandidatesByEmail(email, companyId);
    if (existing.error) {
      return NextResponse.json(
        { error: "Failed to check existing Breezy candidates.", details: existing.error },
        { status: 400 }
      );
    }

    let candidateId = existing.candidateId;

    if (candidateId) {
      const updateUrl = `https://api.breezy.hr/v3/company/${encodeURIComponent(
        companyId
      )}/position/${encodeURIComponent(positionId)}/candidate/${encodeURIComponent(candidateId)}`;
      const updateRes = await breezyFetch(updateUrl, {
        method: "PUT",
        body: JSON.stringify(candidatePayload),
      });
      if (!updateRes.ok) {
        const details = await updateRes.json().catch(() => null);
        return NextResponse.json(
          {
            error: extractErrorMessage(details, "Failed to update Breezy candidate."),
            details,
          },
          { status: updateRes.status }
        );
      }
      await uploadResumeToBreezy({
        companyId,
        positionId,
        candidateId,
        file: cvFile,
      });
    } else {
      candidateId = await createCandidateFromResume({
        companyId,
        positionId,
        file: cvFile,
      }).catch((createError) => {
        throw new Error(
          createError instanceof Error
            ? createError.message
            : "Failed to create Breezy candidate from resume."
        );
      });

      const updateUrl = `https://api.breezy.hr/v3/company/${encodeURIComponent(
        companyId
      )}/position/${encodeURIComponent(positionId)}/candidate/${encodeURIComponent(candidateId)}`;
      const updateRes = await breezyFetch(updateUrl, {
        method: "PUT",
        body: JSON.stringify(candidatePayload),
      });
      const updateBody = await updateRes.json().catch(() => null);
      if (!updateRes.ok) {
        return NextResponse.json(
          {
            error: extractErrorMessage(
              updateBody,
              "Candidate was created in Breezy, but profile details failed to update."
            ),
            details: updateBody,
            candidateId,
          },
          { status: updateRes.status }
        );
      }
    }

    if (!candidateId) {
      return NextResponse.json({ error: "Breezy did not return a candidate id." }, { status: 502 });
    }

    return NextResponse.json({
      ok: true,
      candidateId,
      action: existing.candidateId ? "updated" : "created",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
