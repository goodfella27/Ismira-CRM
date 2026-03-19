import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { invalidateMailerLiteApiKeyCache } from "@/lib/mailerlite";

export const runtime = "nodejs";

const getPrimaryCompanyId = async (
  admin: ReturnType<typeof createSupabaseAdminClient>
) => {
  const { data, error } = await admin
    .from("companies")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message ?? "Failed to load company");
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

const isAdmin = async (
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
  if (error) throw new Error(error.message ?? "Failed to load member role");
  const role = (data?.role as string | null) ?? null;
  return role ? role.toLowerCase() === "admin" : false;
};

const maskSecret = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.length <= 8) return "•".repeat(trimmed.length);
  return `${"•".repeat(Math.max(8, trimmed.length - 4))}${trimmed.slice(-4)}`;
};

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const sessionRes = await supabase.auth.getSession();
    const user = sessionRes.data.session?.user ?? null;
    if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const admin = createSupabaseAdminClient();
    const companyId = await getPrimaryCompanyId(admin);
    const allowed = await isAdmin(admin, companyId, user.id);
    if (!allowed) {
      // Still return safe status (configured?) but no secret details.
      const envKey = process.env.MAILERLITE_API_KEY?.trim() ?? "";
      return NextResponse.json({
        mailerlite: {
          configured: Boolean(envKey),
          source: envKey ? "env" : "none",
          masked: envKey ? maskSecret(envKey) : null,
          canEdit: false,
        },
      });
    }

    const { data: row } = await admin
      .from("company_integrations")
      .select("mailerlite_api_key")
      .eq("company_id", companyId)
      .maybeSingle();

    const dbKey = (row?.mailerlite_api_key as string | null)?.trim() ?? "";
    const envKey = process.env.MAILERLITE_API_KEY?.trim() ?? "";
    const effective = dbKey || envKey;
    const source = dbKey ? "db" : envKey ? "env" : "none";

    return NextResponse.json({
      mailerlite: {
        configured: Boolean(effective),
        source,
        masked: effective ? maskSecret(effective) : null,
        canEdit: true,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load integrations.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const sessionRes = await supabase.auth.getSession();
    const user = sessionRes.data.session?.user ?? null;
    if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const body = (await request.json().catch(() => null)) as
      | { mailerlite_api_key?: string | null }
      | null;

    const admin = createSupabaseAdminClient();
    const companyId = await getPrimaryCompanyId(admin);
    const allowed = await isAdmin(admin, companyId, user.id);
    if (!allowed) {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }

    const nextKeyRaw = body?.mailerlite_api_key ?? null;
    const nextKey = typeof nextKeyRaw === "string" ? nextKeyRaw.trim() : "";

    await admin.from("company_integrations").upsert({
      company_id: companyId,
      mailerlite_api_key: nextKey ? nextKey : null,
    });
    invalidateMailerLiteApiKeyCache();

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update integrations.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
