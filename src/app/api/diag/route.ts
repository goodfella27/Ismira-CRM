import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const mask = (value?: string | null, keepStart = 6, keepEnd = 4) => {
  const raw = value ?? "";
  if (!raw) return "";
  if (raw.length <= keepStart + keepEnd + 3) return `${raw.slice(0, 3)}…`;
  return `${raw.slice(0, keepStart)}…${raw.slice(-keepEnd)}`;
};

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

  let userId: string | null = null;
  let authError: string | null = null;

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.getUser();
    if (error) authError = error.message ?? "Failed to get user";
    userId = data.user?.id ?? null;
  } catch (error) {
    authError = error instanceof Error ? error.message : "Failed to get user";
  }

  const result: Record<string, unknown> = {
    env: {
      url,
      anonKey: mask(anonKey),
      serviceKey: mask(serviceKey),
    },
    auth: {
      userId,
      error: authError,
    },
  };

  try {
    const admin = createSupabaseAdminClient();

    const checks = await Promise.all([
      admin.from("pipelines").select("id", { count: "exact" }).limit(50),
      admin
        .from("pipeline_stages")
        .select("pipeline_id,id", { count: "exact" })
        .eq("pipeline_id", "mailerlite")
        .limit(50),
      admin.from("companies").select("id", { count: "exact" }).limit(50),
      userId
        ? admin
            .from("company_members")
            .select("company_id,role", { count: "exact" })
            .eq("user_id", userId)
            .limit(50)
        : Promise.resolve({ data: null, error: null }),
    ]);

    const [pipelines, stages, companies, members] = checks;
    result.db = {
      pipelines: pipelines.error ? pipelines.error.message : pipelines.data,
      pipelinesCount: pipelines.error ? null : pipelines.count ?? null,
      mailerliteStages: stages.error ? stages.error.message : stages.data,
      mailerliteStagesCount: stages.error ? null : stages.count ?? null,
      companies: companies.error ? companies.error.message : companies.data,
      companiesCount: companies.error ? null : companies.count ?? null,
      memberRows: members.error ? members.error.message : members.data,
      memberRowsCount: members.error ? null : members.count ?? null,
    };
  } catch (error) {
    result.dbError = error instanceof Error ? error.message : "DB diagnostics failed";
  }

  return NextResponse.json(result);
}
