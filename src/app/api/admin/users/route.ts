import { NextResponse } from "next/server";

import {
  normalizeManagedUserRole,
  setManagedUserRole,
} from "@/lib/auth/access";
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

const resolveAvatarPath = (user: {
  user_metadata?: Record<string, unknown> | null;
}) => {
  const metadata = user.user_metadata ?? {};
  return typeof metadata.avatar_path === "string" ? metadata.avatar_path : null;
};

const resolveAvatarUrl = async (
  admin: ReturnType<typeof createSupabaseAdminClient>,
  user: { user_metadata?: Record<string, unknown> | null }
) => {
  const metadata = user.user_metadata ?? {};
  if (typeof metadata.avatar_url === "string") {
    return metadata.avatar_url;
  }
  const path = resolveAvatarPath(user);
  if (!path) return null;
  const { data, error } = await admin.storage
    .from("candidate-documents")
    .createSignedUrl(path, 60 * 60 * 24);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
};

export async function GET() {
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

  let role: string | null = null;
  try {
    role = await getMemberRole(admin, companyId, user.id);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load role" },
      { status: 500 }
    );
  }

  if (!role) {
    try {
      const seeded = await ensureBootstrapAdmin(admin, companyId, user.id);
      if (seeded) {
        role = "Admin";
      }
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Failed to verify admin" },
        { status: 500 }
      );
    }
  }

  if (!role || role.toLowerCase() !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: memberRows, error: memberError } = await admin
    .from("company_members")
    .select("user_id, role")
    .eq("company_id", companyId);
  if (memberError) {
    return NextResponse.json(
      { error: memberError.message ?? "Failed to load members" },
      { status: 500 }
    );
  }
  const memberRoleByUserId = new Map<string, string>();
  (memberRows ?? []).forEach((row) => {
    if (row.user_id && typeof row.role === "string") {
      memberRoleByUserId.set(row.user_id as string, row.role.trim().toLowerCase());
    }
  });
  const { data: portalRows, error: portalError } = await admin
    .from("job_portal_access")
    .select("user_id,access_level,status,access_until");
  const portalTableMissing = /job_portal_access|schema cache|does not exist|could not find the table/i.test(
    portalError?.message ?? ""
  );
  if (portalError && !portalTableMissing) {
    return NextResponse.json(
      { error: portalError.message ?? "Failed to load portal access" },
      { status: 500 }
    );
  }
  const portalByUserId = new Map(
    (portalRows ?? []).map((row) => [row.user_id as string, row] as const)
  );
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

  const users = await Promise.all(
    (data?.users ?? [])
      .map(async (item) => ({
      id: item.id,
      email: item.email ?? "",
      name: resolveName(item),
      role: memberRoleByUserId.get(item.id) === "admin"
        ? "Admin"
        : ["member premium", "member_premium", "premium", "recruiter"].includes(
              memberRoleByUserId.get(item.id) ?? ""
            ) || portalByUserId.get(item.id)?.access_level === "member_premium"
          ? "Member Premium"
          : portalByUserId.get(item.id)?.access_level === "member_basic"
            ? "Member Basic"
            : "Visitor",
      access_until: portalByUserId.get(item.id)?.access_until ?? null,
      avatar_url: await resolveAvatarUrl(admin, item),
      avatar_path: resolveAvatarPath(item),
      status: item.email_confirmed_at ? "active" : "pending",
      created_at: item.created_at ?? null,
      email_confirmed_at: item.email_confirmed_at ?? null,
    }))
  );

  return NextResponse.json({ users });
}

export async function POST(request: Request) {
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

  let payload: { email?: string; name?: string; role?: string };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const email = payload.email?.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  const role = normalizeManagedUserRole(payload.role);
  const name = payload.name?.trim() || email.split("@")[0] || "User";

  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: {
      full_name: name,
      role,
    },
  });

  if (error) {
    return NextResponse.json(
      { error: error.message ?? "Failed to invite user" },
      { status: 500 }
    );
  }

  const invited = data?.user;
  if (!invited) {
    return NextResponse.json({ error: "Invite failed" }, { status: 500 });
  }

  try {
    await setManagedUserRole(admin, companyId, invited.id, role);
  } catch (roleError) {
    return NextResponse.json(
      { error: roleError instanceof Error ? roleError.message : "Failed to set access" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    user: {
      id: invited.id,
      email: invited.email ?? "",
      name: resolveName(invited),
      role,
      avatar_url: await resolveAvatarUrl(admin, invited),
      avatar_path: resolveAvatarPath(invited),
      status: invited.email_confirmed_at ? "active" : "pending",
      created_at: invited.created_at ?? null,
      email_confirmed_at: invited.email_confirmed_at ?? null,
    },
  });
}
