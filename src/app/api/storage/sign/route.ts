import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ensureCompanyMembership } from "@/lib/company/membership";

export const runtime = "nodejs";

const getRequestUser = async () => {
  try {
    const supabase = await createSupabaseServerClient();
    const result = await supabase.auth.getUser();
    return {
      supabase,
      user: result.data.user,
      error: result.error,
    };
  } catch (error) {
    return {
      supabase: null,
      user: null,
      error:
        error instanceof Error ? error : new Error("Failed to verify session."),
    };
  }
};

export async function GET(request: Request) {
  const { supabase, user, error: userError } = await getRequestUser();

  if (userError || !user || !supabase) {
    return NextResponse.json(
      { error: userError?.message ?? "Unauthorized" },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(request.url);
  const path = searchParams.get("path");
  const bucket = searchParams.get("bucket") ?? "candidate-documents";
  if (!path) {
    return NextResponse.json({ error: "Missing path" }, { status: 400 });
  }
  const isOwnProfile =
    bucket === "candidate-documents" &&
    path.startsWith(`profiles/${user.id}/`);
  const admin = createSupabaseAdminClient();
  if (!isOwnProfile) {
    await ensureCompanyMembership(admin, user.id);
  }
  const { data, error } = await admin.storage
    .from(bucket)
    .createSignedUrl(path, 60 * 15);

  if (error || !data?.signedUrl) {
    return NextResponse.json(
      { error: error?.message ?? "Unable to sign URL" },
      { status: 500 }
    );
  }

  return NextResponse.json({ url: data.signedUrl });
}
