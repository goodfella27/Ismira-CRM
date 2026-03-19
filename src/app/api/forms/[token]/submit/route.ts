import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { FORM_FILE_FIELDS } from "@/lib/form-fields";

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
    .from("intake_forms")
    .select("id, fields, status, expires_at")
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
  const payload: Record<string, unknown> = {};

  for (const field of form.fields ?? []) {
    const value = formData.get(field);
    if (!value) continue;

    if (FORM_FILE_FIELDS.has(field)) {
      if (value instanceof File && value.size > 0) {
        const safeName = value.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `forms/${form.id}/${field}-${Date.now()}-${safeName}`;
        const { error: uploadError } = await admin.storage
          .from("candidate-documents")
          .upload(path, value, { contentType: value.type, upsert: true });

        if (uploadError) {
          return NextResponse.json(
            { error: uploadError.message ?? "Upload failed" },
            { status: 500 }
          );
        }

        payload[field] = {
          path,
          url: null,
          name: value.name,
          mime: value.type,
        };
      }
    } else if (typeof value === "string" && value.trim()) {
      payload[field] = value.trim();
    }
  }

  const { error: updateError } = await admin
    .from("intake_forms")
    .update({
      status: "submitted",
      payload,
      submitted_at: new Date().toISOString(),
    })
    .eq("id", form.id);

  if (updateError) {
    return NextResponse.json(
      { error: updateError.message ?? "Failed to submit" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
