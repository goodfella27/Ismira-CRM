import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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
  if (!isOwnProfile) {
    const { data: member } = await supabase
      .from("company_members")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!member) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const admin = createSupabaseAdminClient();
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
