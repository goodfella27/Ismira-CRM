import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const getPrimaryCompanyId = async (
  admin: ReturnType<typeof createSupabaseAdminClient>
) => {
  const { data, error } = await admin
    .from("companies")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1);
  if (error) throw new Error(error.message ?? "Failed to load company");
  const first = Array.isArray(data) ? data[0] : null;
  if (first?.id) return first.id as string;

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

export const isCompanyAdmin = async (
  admin: ReturnType<typeof createSupabaseAdminClient>,
  companyId: string,
  userId: string
) => {
  const { data, error } = await admin
    .from("company_members")
    .select("role")
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .limit(1);
  if (error) throw new Error(error.message ?? "Failed to load member role");
  type MemberRoleRow = { role: string | null };
  const list = Array.isArray(data) ? (data as unknown as MemberRoleRow[]) : [];
  const role = list[0]?.role ?? null;
  return role ? role.toLowerCase() === "admin" : false;
};
