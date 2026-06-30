import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ensureCompanyMembership } from "@/lib/company/membership";

export const runtime = "nodejs";

const BUCKET = "job-assets";

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

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }

    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "Only image uploads are supported" }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();
    const membership = await ensureCompanyMembership(admin, user.id);

    const { data: buckets, error: bucketsError } = await admin.storage.listBuckets();
    if (bucketsError) {
      return NextResponse.json(
        { error: bucketsError.message ?? "Failed to list storage buckets" },
        { status: 500 }
      );
    }

    const hasBucket = (buckets ?? []).some((b) => b.id === BUCKET || b.name === BUCKET);
    if (!hasBucket) {
      const { error: createBucketError } = await admin.storage.createBucket(BUCKET, {
        public: true,
      });
      if (createBucketError && !/already exists/i.test(createBucketError.message ?? "")) {
        return NextResponse.json(
          { error: createBucketError.message ?? `Failed to create bucket "${BUCKET}"` },
          { status: 500 }
        );
      }
    }

    const safeName = sanitizeName(file.name);
    const path = `positions/${membership.companyId}/${Date.now()}-${randomUUID()}-${safeName}`;

    const { error: uploadError } = await admin.storage
      .from(BUCKET)
      .upload(path, file, { contentType: file.type, upsert: true });

    if (uploadError) {
      return NextResponse.json(
        { error: uploadError.message ?? "Upload failed" },
        { status: 500 }
      );
    }

    const { data } = admin.storage.from(BUCKET).getPublicUrl(path);
    const publicUrl = data?.publicUrl ?? "";
    if (!publicUrl) {
      return NextResponse.json({ error: "Unable to generate public URL" }, { status: 500 });
    }

    return NextResponse.json({ bucket: BUCKET, path, url: publicUrl }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
