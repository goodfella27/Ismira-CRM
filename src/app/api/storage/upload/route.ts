import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ensureCompanyMembership } from "@/lib/company/membership";

export async function POST(request: Request) {
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
  const candidateId = formData.get("candidateId");

  if (!(file instanceof File) || !candidateId || typeof candidateId !== "string") {
    return NextResponse.json({ error: "Missing file or candidateId" }, { status: 400 });
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `manual/${candidateId}/${Date.now()}-${safeName}`;

  const admin = createSupabaseAdminClient();
  await ensureCompanyMembership(admin, user.id);
  const { error: uploadError } = await admin.storage
    .from("candidate-documents")
    .upload(path, file, { contentType: file.type, upsert: true });

  if (uploadError) {
    return NextResponse.json(
      { error: uploadError.message ?? "Upload failed" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    path,
    name: file.name,
    mime: file.type,
  });
}
