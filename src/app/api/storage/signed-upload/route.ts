import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ensureCompanyMembership } from "@/lib/company/membership";

export const runtime = "nodejs";

const sanitizeName = (value: string) =>
  value.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "upload";

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const filename =
      body && typeof body.name === "string" ? body.name.trim() : "";
    const contentType =
      body && typeof body.contentType === "string" ? body.contentType.trim() : "";
    const safeName = sanitizeName(filename || "audio");

    const bucket =
      body && typeof body.bucket === "string" && body.bucket.trim()
        ? body.bucket.trim()
        : "candidate-documents";

    const path = `intake/${user.id}/${Date.now()}-${randomUUID()}-${safeName}`;

    const admin = createSupabaseAdminClient();
    await ensureCompanyMembership(admin, user.id);

    const { data, error } = await admin.storage
      .from(bucket)
      .createSignedUploadUrl(path);

    if (error || !data?.signedUrl) {
      return NextResponse.json(
        { error: error?.message ?? "Unable to create signed upload URL" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      bucket,
      path,
      signedUrl: data.signedUrl,
      token: data.token,
      contentType: contentType || undefined,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to create upload URL";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

