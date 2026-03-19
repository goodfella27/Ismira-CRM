import { NextRequest, NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const getOrCreateCompanyId = async (
  admin: ReturnType<typeof createSupabaseAdminClient>,
  userId: string
) => {
  const { data: memberRow, error: memberError } = await admin
    .from("company_members")
    .select("company_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (memberError) {
    throw new Error(memberError.message ?? "Failed to load membership");
  }
  if (memberRow?.company_id) return memberRow.company_id as string;

  const { data, error } = await admin
    .from("companies")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error(error.message ?? "Failed to load company");
  }
  if (data?.id) return data.id as string;
  const { data: created, error: createError } = await admin
    .from("companies")
    .insert({ name: "Default Company" })
    .select("id")
    .single();
  if (createError || !created?.id) {
    throw new Error(createError?.message ?? "Failed to create company");
  }
  return created.id as string;
};

const resolveName = (user: {
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
}) => {
  const metadata = user.user_metadata ?? {};
  const first = typeof metadata.first_name === "string" ? metadata.first_name.trim() : "";
  const last = typeof metadata.last_name === "string" ? metadata.last_name.trim() : "";
  const combined = [first, last].filter(Boolean).join(" ").trim();
  const fallback =
    (typeof metadata.full_name === "string" && metadata.full_name.trim()) ||
    (typeof metadata.name === "string" && metadata.name.trim()) ||
    (typeof metadata.display_name === "string" && metadata.display_name.trim()) ||
    "";
  if (combined) return combined;
  if (fallback) return fallback;
  const email = user.email ?? "";
  return email.split("@")[0] || "User";
};

const resolveAvatarPath = (user: { user_metadata?: Record<string, unknown> | null }) => {
  const metadata = user.user_metadata ?? {};
  return typeof metadata.avatar_path === "string" ? metadata.avatar_path : null;
};

const resolveAvatarUrl = async (
  admin: ReturnType<typeof createSupabaseAdminClient>,
  user: { user_metadata?: Record<string, unknown> | null }
) => {
  const metadata = user.user_metadata ?? {};
  if (typeof metadata.avatar_url === "string" && metadata.avatar_url.trim()) {
    return metadata.avatar_url.trim();
  }

  const path = resolveAvatarPath(user);
  if (!path) return null;

  const { data, error } = await admin.storage
    .from("candidate-documents")
    .createSignedUrl(path, 60 * 60 * 24);

  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
};

export async function GET(request: NextRequest) {
  let user: { id: string } | null = null;
  let userError: Error | null = null;

  try {
    const supabase = await createSupabaseServerClient();
    const result = await supabase.auth.getUser();
    user = result.data.user;
    userError = result.error;
  } catch (error) {
    userError =
      error instanceof Error ? error : new Error("Failed to verify session.");
  }

  if (userError || !user) {
    return NextResponse.json(
      { error: userError?.message ?? "Unauthorized" },
      { status: 401 }
    );
  }

  const admin = createSupabaseAdminClient();
  const includeAvatars = request.nextUrl.searchParams.get("include_avatars") === "1";

  let companyId: string;
  try {
    companyId = await getOrCreateCompanyId(admin, user.id);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load company" },
      { status: 500 }
    );
  }

  const { data: membership, error: membershipError } = await admin
    .from("company_members")
    .select("user_id")
    .eq("company_id", companyId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (membershipError) {
    return NextResponse.json(
      { error: membershipError.message ?? "Failed to load membership" },
      { status: 500 }
    );
  }

  if (!membership?.user_id) {
    const { error: insertError } = await admin.from("company_members").insert({
      company_id: companyId,
      user_id: user.id,
      role: "Admin",
    });
    if (insertError) {
      return NextResponse.json(
        { error: insertError.message ?? "Failed to bootstrap membership" },
        { status: 500 }
      );
    }
  }

  const { data: memberRows, error: memberError } = await admin
    .from("company_members")
    .select("user_id")
    .eq("company_id", companyId);

  if (memberError) {
    return NextResponse.json(
      { error: memberError.message ?? "Failed to load members" },
      { status: 500 }
    );
  }

  const memberIds = new Set<string>();
  (memberRows ?? []).forEach((row) => {
    if (row.user_id) memberIds.add(row.user_id as string);
  });

  const { data, error } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });

  if (error) {
    return NextResponse.json(
      { error: error.message ?? "Failed to load users" },
      { status: 500 }
    );
  }

  const members = await Promise.all(
    (data?.users ?? [])
      .filter((item) => memberIds.size === 0 || memberIds.has(item.id))
      .map(async (item) => ({
        user_id: item.id,
        email: item.email ?? "",
        name: resolveName(item),
        avatar_path: resolveAvatarPath(item),
        avatar_url: includeAvatars ? await resolveAvatarUrl(admin, item) : null,
      }))
  );

  return NextResponse.json({ company_id: companyId, members });
}
