import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const uploadRoot = path.join(os.tmpdir(), "ismira_uploads");

const sanitizeName = (value: string) =>
  value.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "upload";

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "Missing upload file" }, { status: 400 });
    }

    await fs.mkdir(uploadRoot, { recursive: true });

    const fileId = randomUUID();
    const safeName = sanitizeName(file.name || "audio");
    const storedName = `${fileId}__${safeName}`;
    const filePath = path.join(uploadRoot, storedName);

    const bytes = await file.arrayBuffer();
    await fs.writeFile(filePath, Buffer.from(bytes));

    return NextResponse.json({ fileId, name: storedName, size: file.size });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
