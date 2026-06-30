import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

export type PortalAccessLevel = "visitor" | "member_basic" | "member_premium";
export type ManagedUserRole = "Admin" | "Member Premium" | "Member Basic" | "Visitor";

export type UserAccess = {
  userId: string;
  role: ManagedUserRole;
  isAdmin: boolean;
  accessLevel: PortalAccessLevel;
  status: "active" | "inactive";
  accessUntil: string | null;
  canAccessHrPortal: boolean;
  canEditHrPortal: boolean;
  canManageUsers: boolean;
  canManagePayments: boolean;
  canViewPrivateFields: boolean;
  /** Backwards-compatible alias used by the jobs UI. */
  canViewPremium: boolean;
};

const isMissingAccessTableError = (message: string) =>
  /job_portal_access|schema cache|does not exist|could not find the table/i.test(message);

export async function resolveUserAccess(admin: AdminClient, userId: string): Promise<UserAccess> {
  const { data: memberRows, error: memberError } = await admin
    .from("company_members")
    .select("role")
    .eq("user_id", userId);

  if (memberError) {
    throw new Error(memberError.message ?? "Failed to resolve admin access");
  }

  const memberRoles = Array.isArray(memberRows)
    ? memberRows
        .map((row) => (typeof row.role === "string" ? row.role.trim().toLowerCase() : ""))
        .filter(Boolean)
    : [];
  const isAdmin = memberRoles.includes("admin");
  const isMemberPremium = memberRoles.some(
    (role) =>
      role === "member premium" ||
      role === "member_premium" ||
      role === "premium" ||
      role === "recruiter"
  );

  let accessLevel: PortalAccessLevel = isMemberPremium ? "member_premium" : "visitor";
  let status: "active" | "inactive" = "active";
  let accessUntil: string | null = null;

  const { data: portalAccess, error: portalError } = await admin
    .from("job_portal_access")
    .select("access_level,status,access_until")
    .eq("user_id", userId)
    .maybeSingle();

  if (portalError && !isMissingAccessTableError(portalError.message ?? "")) {
    throw new Error(portalError.message ?? "Failed to resolve portal access");
  }

  if (portalAccess) {
    accessLevel =
      portalAccess.access_level === "member_premium" ? "member_premium" : "member_basic";
    status = portalAccess.status === "inactive" ? "inactive" : "active";
    accessUntil =
      typeof portalAccess.access_until === "string" ? portalAccess.access_until : null;
  }

  const accessNotExpired =
    !accessUntil || Number.isNaN(Date.parse(accessUntil)) || Date.parse(accessUntil) > Date.now();
  const activeMemberAccess = status === "active" && accessNotExpired;
  const canAccessHrPortal = isAdmin || (isMemberPremium && activeMemberAccess);
  const canViewPrivateFields =
    isAdmin || (accessLevel !== "visitor" && activeMemberAccess);
  const role: ManagedUserRole = isAdmin
    ? "Admin"
    : isMemberPremium
      ? "Member Premium"
      : accessLevel === "member_basic" && activeMemberAccess
        ? "Member Basic"
        : "Visitor";

  return {
    userId,
    role,
    isAdmin,
    accessLevel,
    status,
    accessUntil,
    canAccessHrPortal,
    canEditHrPortal: canAccessHrPortal,
    canManageUsers: isAdmin,
    canManagePayments: isAdmin,
    canViewPrivateFields,
    canViewPremium: canViewPrivateFields,
  };
}

export async function getCurrentUserAccess() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  const admin = createSupabaseAdminClient();
  return resolveUserAccess(admin, data.user.id);
}

export async function requireCurrentAdmin() {
  const access = await getCurrentUserAccess();
  if (!access) throw new Error("Not authenticated.");
  if (!access.isAdmin) throw new Error("Admin access required.");
  return access;
}

export async function requireCurrentHrEditor() {
  const access = await getCurrentUserAccess();
  if (!access) throw new Error("Not authenticated.");
  if (!access.canEditHrPortal) throw new Error("HR editor access required.");
  return access;
}

export function normalizeManagedUserRole(value: unknown): ManagedUserRole {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (normalized === "admin") return "Admin";
  if (["member premium", "member_premium", "premium", "recruiter"].includes(normalized)) {
    return "Member Premium";
  }
  if (["member basic", "member_basic", "basic", "free"].includes(normalized)) {
    return "Member Basic";
  }
  return "Visitor";
}

export async function setManagedUserRole(
  admin: AdminClient,
  companyId: string,
  userId: string,
  roleValue: unknown
) {
  const role = normalizeManagedUserRole(roleValue);

  if (role === "Admin" || role === "Member Premium") {
    const { error } = await admin.from("company_members").upsert({
      company_id: companyId,
      user_id: userId,
      role,
    });
    if (error) throw new Error(error.message ?? "Failed to grant HR Portal access");

    if (role === "Member Premium") {
      const { error: portalError } = await admin.from("job_portal_access").upsert({
        user_id: userId,
        access_level: "member_premium",
        status: "active",
        access_source: "recruiter",
      });
      if (portalError) throw new Error(portalError.message ?? "Failed to update portal access");
    }
    return role;
  }

  const { error: membershipError } = await admin
    .from("company_members")
    .delete()
    .eq("company_id", companyId)
    .eq("user_id", userId);
  if (membershipError) {
    throw new Error(membershipError.message ?? "Failed to remove admin access");
  }

  if (role === "Visitor") {
    const { error: portalError } = await admin
      .from("job_portal_access")
      .delete()
      .eq("user_id", userId);
    if (portalError) throw new Error(portalError.message ?? "Failed to remove portal access");
  } else {
    const { error: portalError } = await admin.from("job_portal_access").upsert({
      user_id: userId,
      access_level: "member_basic",
      status: "active",
      access_source: "manual",
    });
    if (portalError) throw new Error(portalError.message ?? "Failed to update portal access");
  }
  return role;
}
