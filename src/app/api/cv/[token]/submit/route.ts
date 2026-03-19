import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type ExperienceEntry = {
  role?: string;
  company?: string;
  start?: string;
  end?: string;
  details?: string;
};

type EducationEntry = {
  institution?: string;
  degree?: string;
  start?: string;
  end?: string;
  details?: string;
};

type SkillEntry = {
  name?: string;
  level?: number;
};

type CvPayload = {
  full_name?: string;
  title?: string;
  email?: string;
  phone?: string;
  location?: string;
  summary?: string;
  certifications?: string;
  experiences: ExperienceEntry[];
  education: EducationEntry[];
  skills: SkillEntry[];
  languages: SkillEntry[];
};

const formatDate = (value?: string) => {
  if (!value) return "";
  const parsed = new Date(`${value}-01`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-US", { month: "short", year: "numeric" });
};

const clampLevel = (level?: number) => {
  if (typeof level !== "number") return 70;
  return Math.min(100, Math.max(10, Math.round(level)));
};

const buildPdf = async (
  payload: CvPayload,
  photo?: { bytes: Uint8Array; mime: string | null }
) => {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pageSize: [number, number] = [595.28, 841.89];
  const page = pdfDoc.addPage(pageSize);
  const pageWidth = page.getWidth();
  const pageHeight = page.getHeight();
  const sidebarWidth = 200;
  const padding = 32;
  const rightX = sidebarWidth + padding;
  const rightWidth = pageWidth - rightX - padding;

  const sidebarColor = rgb(0.18, 0.2, 0.23);
  const accent = rgb(0.1, 0.6, 0.48);
  const textDark = rgb(0.15, 0.18, 0.22);

  page.drawRectangle({
    x: 0,
    y: 0,
    width: sidebarWidth,
    height: pageHeight,
    color: sidebarColor,
  });

  let rightY = pageHeight - padding;
  const wrapLines = (text: string, fontRef: typeof font, size: number, max: number) => {
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length === 0) return [""];
    const lines: string[] = [];
    let current = words[0];
    for (let i = 1; i < words.length; i += 1) {
      const next = `${current} ${words[i]}`;
      const width = fontRef.widthOfTextAtSize(next, size);
      if (width <= max) {
        current = next;
      } else {
        lines.push(current);
        current = words[i];
      }
    }
    lines.push(current);
    return lines;
  };

  const drawRightText = (
    text: string,
    options: { size?: number; fontRef?: typeof font; color?: [number, number, number] } = {}
  ) => {
    const size = options.size ?? 11;
    const fontRef = options.fontRef ?? font;
    const color = options.color ?? [0.2, 0.22, 0.25];
    page.drawText(text, {
      x: rightX,
      y: rightY,
      size,
      font: fontRef,
      color: rgb(color[0], color[1], color[2]),
    });
    rightY -= size + 4;
  };

  const drawRightParagraph = (text: string, size = 11) => {
    const lines = wrapLines(text, font, size, rightWidth);
    lines.forEach((line) => drawRightText(line, { size }));
  };

  const drawSectionTitle = (title: string) => {
    drawRightText(title, { fontRef: boldFont, size: 13, color: [0.1, 0.1, 0.12] });
    page.drawLine({
      start: { x: rightX, y: rightY + 2 },
      end: { x: rightX + 28, y: rightY + 2 },
      thickness: 1.2,
      color: accent,
    });
    rightY -= 12;
  };

  const photoSize = 140;
  const photoX = (sidebarWidth - photoSize) / 2;
  const photoY = pageHeight - padding - photoSize;
  page.drawRectangle({
    x: photoX,
    y: photoY,
    width: photoSize,
    height: photoSize,
    color: rgb(0.25, 0.27, 0.3),
  });

  if (photo?.bytes) {
    try {
      const image =
        photo.mime === "image/png"
          ? await pdfDoc.embedPng(photo.bytes)
          : await pdfDoc.embedJpg(photo.bytes);
      const { width, height } = image.scale(1);
      const scale = Math.max(photoSize / width, photoSize / height);
      const drawWidth = width * scale;
      const drawHeight = height * scale;
      const offsetX = photoX + (photoSize - drawWidth) / 2;
      const offsetY = photoY + (photoSize - drawHeight) / 2;
      page.drawImage(image, {
        x: offsetX,
        y: offsetY,
        width: drawWidth,
        height: drawHeight,
      });
    } catch {
      // ignore photo embed issues
    }
  }

  const leftTextX = 22;
  let leftY = photoY - 30;
  const fullName = payload.full_name || "Candidate";
  page.drawText(fullName, {
    x: leftTextX,
    y: leftY,
    size: 18,
    font: boldFont,
    color: rgb(1, 1, 1),
  });
  leftY -= 22;
  if (payload.title) {
    page.drawText(payload.title, {
      x: leftTextX,
      y: leftY,
      size: 11,
      font,
      color: rgb(0.9, 0.92, 0.94),
    });
    leftY -= 18;
  }

  leftY -= 10;
  page.drawText("Contact", {
    x: leftTextX,
    y: leftY,
    size: 12,
    font: boldFont,
    color: rgb(1, 1, 1),
  });
  leftY -= 14;
  page.drawLine({
    start: { x: leftTextX, y: leftY + 6 },
    end: { x: leftTextX + 30, y: leftY + 6 },
    thickness: 1,
    color: accent,
  });
  leftY -= 10;

  const drawLeftLine = (label: string, value?: string) => {
    if (!value) return;
    page.drawText(label, {
      x: leftTextX,
      y: leftY,
      size: 8,
      font: boldFont,
      color: rgb(0.8, 0.82, 0.86),
    });
    leftY -= 10;
    const lines = wrapLines(value, font, 9, sidebarWidth - 32);
    lines.forEach((line) => {
      page.drawText(line, {
        x: leftTextX,
        y: leftY,
        size: 9,
        font,
        color: rgb(0.95, 0.96, 0.97),
      });
      leftY -= 12;
    });
    leftY -= 6;
  };

  drawLeftLine("Email", payload.email);
  drawLeftLine("Phone", payload.phone);
  drawLeftLine("Address", payload.location);

  leftY -= 6;
  page.drawText("Languages", {
    x: leftTextX,
    y: leftY,
    size: 12,
    font: boldFont,
    color: rgb(1, 1, 1),
  });
  leftY -= 14;
  page.drawLine({
    start: { x: leftTextX, y: leftY + 6 },
    end: { x: leftTextX + 30, y: leftY + 6 },
    thickness: 1,
    color: accent,
  });
  leftY -= 6;

  payload.languages.slice(0, 6).forEach((lang) => {
    if (!lang.name) return;
    page.drawText(lang.name, {
      x: leftTextX,
      y: leftY,
      size: 9,
      font,
      color: rgb(0.95, 0.96, 0.97),
    });
    leftY -= 10;
    const barWidth = sidebarWidth - 42;
    const level = clampLevel(lang.level);
    page.drawRectangle({
      x: leftTextX,
      y: leftY,
      width: barWidth,
      height: 4,
      color: rgb(0.35, 0.37, 0.4),
    });
    page.drawRectangle({
      x: leftTextX,
      y: leftY,
      width: (barWidth * level) / 100,
      height: 4,
      color: rgb(0.95, 0.95, 0.95),
    });
    leftY -= 14;
  });

  drawSectionTitle("Profile");
  if (payload.summary) {
    drawRightParagraph(payload.summary, 11);
  }

  rightY -= 8;
  drawSectionTitle("Experience");
  payload.experiences.slice(0, 4).forEach((entry) => {
    if (!entry.role && !entry.company && !entry.details) return;
    const dates = [formatDate(entry.start), formatDate(entry.end)]
      .filter(Boolean)
      .join(" - ");
    drawRightText(entry.role ?? "Role", { fontRef: boldFont, size: 11, color: [0.15, 0.18, 0.22] });
    if (dates) {
      drawRightText(dates, { size: 9, color: [0.5, 0.55, 0.6] });
    }
    if (entry.company) {
      drawRightText(entry.company, { size: 9, color: [0.35, 0.38, 0.42] });
    }
    if (entry.details) {
      drawRightParagraph(entry.details, 10);
    }
    rightY -= 6;
  });

  rightY -= 4;
  drawSectionTitle("Education");
  payload.education.slice(0, 4).forEach((entry) => {
    if (!entry.institution && !entry.degree && !entry.details) return;
    const dates = [formatDate(entry.start), formatDate(entry.end)]
      .filter(Boolean)
      .join(" - ");
    drawRightText(entry.institution ?? "Institution", {
      fontRef: boldFont,
      size: 11,
      color: [0.15, 0.18, 0.22],
    });
    if (dates) {
      drawRightText(dates, { size: 9, color: [0.5, 0.55, 0.6] });
    }
    if (entry.degree) {
      drawRightText(entry.degree, { size: 9, color: [0.35, 0.38, 0.42] });
    }
    if (entry.details) {
      drawRightParagraph(entry.details, 10);
    }
    rightY -= 6;
  });

  rightY -= 4;
  drawSectionTitle("Expertise");
  const skillColumns = 2;
  const skillWidth = (rightWidth - 12) / skillColumns;
  let skillIndex = 0;
  payload.skills.slice(0, 6).forEach((skill) => {
    if (!skill.name) return;
    const column = skillIndex % skillColumns;
    const row = Math.floor(skillIndex / skillColumns);
    const x = rightX + column * (skillWidth + 12);
    const y = rightY - row * 26;
    const level = clampLevel(skill.level);
    page.drawText(skill.name, { x, y, size: 9, font, color: textDark });
    page.drawRectangle({
      x,
      y: y - 8,
      width: skillWidth,
      height: 4,
      color: rgb(0.85, 0.85, 0.86),
    });
    page.drawRectangle({
      x,
      y: y - 8,
      width: (skillWidth * level) / 100,
      height: 4,
      color: rgb(0.2, 0.22, 0.25),
    });
    skillIndex += 1;
  });

  if (payload.certifications) {
    rightY -= Math.ceil(skillIndex / skillColumns) * 26 + 12;
    drawSectionTitle("Certifications");
    drawRightParagraph(payload.certifications, 10);
  }

  return pdfDoc.save();
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data: form, error } = await admin
    .from("cv_forms")
    .select("id, candidate_id, candidate_name, candidate_email, status, expires_at")
    .eq("token", token)
    .single();

  if (error || !form) {
    return NextResponse.json({ error: "Form not found" }, { status: 404 });
  }

  if (form.status !== "pending") {
    return NextResponse.json({ error: "Form already used" }, { status: 410 });
  }

  if (form.expires_at && new Date(form.expires_at) < new Date()) {
    return NextResponse.json({ error: "Form expired" }, { status: 410 });
  }

  const formData = await request.formData();
  const payload: CvPayload = {
    experiences: [],
    education: [],
    skills: [],
    languages: [],
  };

  const getText = (field: string) => {
    const value = formData.get(field);
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
  };

  payload.full_name = getText("full_name");
  payload.title = getText("title");
  payload.email = getText("email");
  payload.phone = getText("phone");
  payload.location = getText("location");
  payload.summary = getText("summary");
  payload.certifications = getText("certifications");

  const parseJson = <T>(value?: string | null, fallback: T = [] as T) => {
    if (!value) return fallback;
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  };

  const experienceRaw = parseJson<ExperienceEntry[]>(
    getText("experience_json"),
    []
  );
  const educationRaw = parseJson<EducationEntry[]>(
    getText("education_json"),
    []
  );
  const skillsRaw = parseJson<SkillEntry[]>(getText("skills_json"), []);
  const languagesRaw = parseJson<SkillEntry[]>(getText("languages_json"), []);

  payload.experiences = Array.isArray(experienceRaw) ? experienceRaw : [];
  payload.education = Array.isArray(educationRaw) ? educationRaw : [];
  payload.skills = Array.isArray(skillsRaw) ? skillsRaw : [];
  payload.languages = Array.isArray(languagesRaw) ? languagesRaw : [];

  if (!payload.full_name && form.candidate_name) {
    payload.full_name = form.candidate_name;
  }
  if (!payload.email && form.candidate_email) {
    payload.email = form.candidate_email;
  }

  const photo = formData.get("photo");
  let photoBytes: Uint8Array | undefined;
  let photoMime: string | null = null;
  if (photo instanceof File && photo.size > 0) {
    const arrayBuffer = await photo.arrayBuffer();
    photoBytes = new Uint8Array(arrayBuffer);
    photoMime = photo.type || null;
  }

  const pdfBytes = await buildPdf(payload, photoBytes ? { bytes: photoBytes, mime: photoMime } : undefined);
  const safeName = (payload.full_name || "Candidate")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 40);
  const path = `cv/${form.candidate_id}/${Date.now()}-${safeName}-cv.pdf`;

  const { error: uploadError } = await admin.storage
    .from("candidate-documents")
    .upload(path, pdfBytes, {
      contentType: "application/pdf",
      upsert: true,
    });

  if (uploadError) {
    return NextResponse.json(
      { error: uploadError.message ?? "Upload failed" },
      { status: 500 }
    );
  }

  await admin
    .from("candidate_attachments")
    .delete()
    .eq("candidate_id", form.candidate_id)
    .eq("kind", "resume");

  const { error: attachmentError } = await admin
    .from("candidate_attachments")
    .insert({
      id: crypto.randomUUID(),
      candidate_id: form.candidate_id,
      name: `${payload.full_name ?? "Candidate"} CV`,
      mime: "application/pdf",
      path,
      kind: "resume",
      created_at: new Date().toISOString(),
      created_by: payload.full_name ?? "Candidate",
    });

  if (attachmentError) {
    return NextResponse.json(
      { error: attachmentError.message ?? "Failed to attach CV" },
      { status: 500 }
    );
  }

  const { error: updateError } = await admin
    .from("cv_forms")
    .update({
      status: "submitted",
      payload,
      submitted_at: new Date().toISOString(),
      pdf_path: path,
    })
    .eq("id", form.id);

  if (updateError) {
    return NextResponse.json(
      { error: updateError.message ?? "Failed to finalize CV" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
