import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getPrimaryCompanyId } from "@/lib/company/primary";

export type CompanyMembership = {
  companyId: string;
  role: string;
};

export const ensureCompanyMembership = async (
  admin: ReturnType<typeof createSupabaseAdminClient>,
  userId: string
): Promise<CompanyMembership> => {
  const companyId = await getPrimaryCompanyId(admin);

  const { data: existingRows, error: existingError } = await admin
    .from("company_members")
    .select("role")
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .limit(1);

  if (existingError) {
    throw new Error(existingError.message ?? "Failed to load membership");
  }

  type MemberRow = { role: string | null };
  const list = Array.isArray(existingRows) ? (existingRows as unknown as MemberRow[]) : [];
  const existing = list[0] ?? null;
  if (existing) {
    return { companyId, role: existing.role ?? "Member" };
  }

  const { count, error: countError } = await admin
    .from("company_members")
    .select("user_id", { head: true, count: "exact" })
    .eq("company_id", companyId);

  if (countError) {
    throw new Error(countError.message ?? "Failed to load member count");
  }

  const role = (count ?? 0) === 0 ? "Admin" : "Member";
  const { error: insertError } = await admin.from("company_members").insert({
    company_id: companyId,
    user_id: userId,
    role,
  });

  if (insertError) {
    throw new Error(insertError.message ?? "Failed to create membership");
  }

  return { companyId, role };
};
