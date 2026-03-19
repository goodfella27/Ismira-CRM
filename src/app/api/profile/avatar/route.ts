import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `profiles/${user.id}/${Date.now()}-${safeName}`;

  const admin = createSupabaseAdminClient();
  const { error: uploadError } = await admin.storage
    .from("candidate-documents")
    .upload(path, file, { contentType: file.type, upsert: true });

  if (uploadError) {
    return NextResponse.json(
      { error: uploadError.message ?? "Upload failed" },
      { status: 500 }
    );
  }

  const { error: updateError } = await supabase.auth.updateUser({
    data: {
      avatar_path: path,
    },
  });

  if (updateError) {
    return NextResponse.json(
      { error: updateError.message ?? "Failed to update profile" },
      { status: 500 }
    );
  }

  return NextResponse.json({ path });
}
