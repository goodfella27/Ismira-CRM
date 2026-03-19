import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const getPrimaryCompanyId = async (
  admin: ReturnType<typeof createSupabaseAdminClient>
) => {
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

const ensureBootstrapAdmin = async (
  admin: ReturnType<typeof createSupabaseAdminClient>,
  companyId: string,
  userId: string
) => {
  const { data: existing, error } = await admin
    .from("company_members")
    .select("user_id")
    .eq("company_id", companyId)
    .limit(1);
  if (error) {
    throw new Error(error.message ?? "Failed to load members");
  }
  if (existing && existing.length > 0) return false;
  const { error: insertError } = await admin.from("company_members").insert({
    company_id: companyId,
    user_id: userId,
    role: "Admin",
  });
  if (insertError) {
    throw new Error(insertError.message ?? "Failed to seed admin");
  }
  return true;
};

const getMemberRole = async (
  admin: ReturnType<typeof createSupabaseAdminClient>,
  companyId: string,
  userId: string
) => {
  const { data, error } = await admin
    .from("company_members")
    .select("role")
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    throw new Error(error.message ?? "Failed to load member role");
  }
  return data?.role as string | null;
};

export async function PATCH(
  request: Request,
  { params }: { params: { userId: string } }
) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const admin = createSupabaseAdminClient();
  let companyId: string;
  try {
    companyId = await getPrimaryCompanyId(admin);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load company" },
      { status: 500 }
    );
  }

  let roleCheck: string | null = null;
  try {
    roleCheck = await getMemberRole(admin, companyId, user.id);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load role" },
      { status: 500 }
    );
  }

  if (!roleCheck) {
    try {
      const seeded = await ensureBootstrapAdmin(admin, companyId, user.id);
      if (seeded) {
        roleCheck = "Admin";
      }
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Failed to verify admin" },
        { status: 500 }
      );
    }
  }

  if (!roleCheck || roleCheck.toLowerCase() !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const userId = params.userId;
  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  let payload: { role?: string; confirm?: boolean };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { data: currentData, error: currentError } =
    await admin.auth.admin.getUserById(userId);

  if (currentError || !currentData?.user) {
    return NextResponse.json(
      { error: currentError?.message ?? "User not found" },
      { status: 404 }
    );
  }

  const updates: {
    email_confirm?: boolean;
    user_metadata?: Record<string, unknown>;
  } = {};

  if (payload.confirm) {
    updates.email_confirm = true;
  }

  if (payload.role) {
    const role = payload.role.trim();
    updates.user_metadata = {
      ...(currentData.user.user_metadata ?? {}),
      role: role || "Member",
    };
    const { error: memberError } = await admin
      .from("company_members")
      .upsert({
        company_id: companyId,
        user_id: userId,
        role: role || "Member",
      });
    if (memberError) {
      return NextResponse.json(
        { error: memberError.message ?? "Failed to update role" },
        { status: 500 }
      );
    }
  }

  if (!updates.email_confirm && !updates.user_metadata) {
    return NextResponse.json({ error: "No updates provided" }, { status: 400 });
  }

  const { data: updated, error: updateError } =
    await admin.auth.admin.updateUserById(userId, updates);

  if (updateError || !updated?.user) {
    return NextResponse.json(
      { error: updateError?.message ?? "Failed to update user" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    user: updated.user,
  });
}
