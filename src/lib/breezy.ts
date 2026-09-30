import { createSupabaseServerClient } from "@/lib/supabase/server";

export const BREEZY_RETIRED_MESSAGE = "The Breezy integration has been retired. Existing records are available from Supabase; remote sync and sending are unavailable.";

export function retiredBreezyResponse() {
  return Response.json({ error: BREEZY_RETIRED_MESSAGE, code: "BREEZY_INTEGRATION_RETIRED", source: "supabase" }, { status: 410 });
}

/** Compatibility guard: this function must never perform network requests. */
export async function breezyFetch(_pathOrUrl: string, _init?: RequestInit) {
  void _pathOrUrl;
  void _init;
  return retiredBreezyResponse();
}

export function getBreezyEnv() {
  const normalizeEnvValue = (value: string | undefined) => {
    const trimmed = value?.trim() ?? "";
    if (!trimmed) return undefined;
    if (["...", "your_position_id", "your_company_id", "changeme", "todo"].includes(trimmed.toLowerCase())) {
      return undefined;
    }
    return trimmed;
  };

  const companyId = normalizeEnvValue(process.env.BREEZY_COMPANY_ID);
  const positionId = normalizeEnvValue(process.env.BREEZY_POSITION_ID);

  return { companyId, positionId };
}

export function requireBreezyIds() {
  const { companyId, positionId } = getBreezyEnv();
  if (!companyId || !positionId) {
    throw new Error(
      "Missing valid BREEZY_COMPANY_ID or BREEZY_POSITION_ID. Check .env.local and replace placeholder values."
    );
  }
  return { companyId, positionId };
}

export function requireBreezyCompanyId() {
  const { companyId } = getBreezyEnv();
  if (!companyId) {
    throw new Error("Missing BREEZY_COMPANY_ID");
  }
  return { companyId };
}

export async function findCandidatesByEmail(email: string, companyId: string) {
  const supabase = await createSupabaseServerClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) throw new Error("Not authenticated.");
  const { data, error } = await supabase.from("candidates")
    .select("id,data")
    .contains("data", { breezy: { company_id: companyId } })
    .ilike("data->>email", email.trim().replace(/[\\%_]/g, "\\$&"))
    .limit(100);
  if (error) throw new Error(error.message);
  const candidates = (data ?? []).map((row) => ({ ...row.data, id: row.id, _id: row.id }));
  return { candidates, candidateId: candidates[0]?.id ?? null };
}
