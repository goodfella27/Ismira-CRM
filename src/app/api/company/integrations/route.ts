import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { invalidateMailerLiteApiKeyCache } from "@/lib/mailerlite";
import { invalidateHubspotAccessTokenCache } from "@/lib/hubspot";

export const runtime = "nodejs";

const isMissingCompanyIntegrationsTableError = (message: string) =>
  /could not find the table/i.test(message) && /company_integrations/i.test(message);

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
      const envHubspot = process.env.HUBSPOT_PRIVATE_APP_TOKEN?.trim() ?? "";
      return NextResponse.json({
        mailerlite: {
          configured: Boolean(envKey),
          source: envKey ? "env" : "none",
          masked: envKey ? maskSecret(envKey) : null,
          canEdit: false,
        },
        hubspot: {
          configured: Boolean(envHubspot),
          source: envHubspot ? "env" : "none",
          masked: envHubspot ? maskSecret(envHubspot) : null,
          canEdit: false,
        },
      });
    }

    const { data: row, error: rowError } = await admin
      .from("company_integrations")
      .select("*")
      .eq("company_id", companyId)
      .maybeSingle();
    if (rowError) {
      if (isMissingCompanyIntegrationsTableError(rowError.message ?? "")) {
        return NextResponse.json(
          {
            mailerlite: {
              configured: Boolean(process.env.MAILERLITE_API_KEY?.trim() ?? ""),
              source: process.env.MAILERLITE_API_KEY?.trim() ? "env" : "none",
              masked: (process.env.MAILERLITE_API_KEY?.trim() ?? "")
                ? maskSecret(process.env.MAILERLITE_API_KEY?.trim() ?? "")
                : null,
              canEdit: false,
            },
            hubspot: {
              configured: Boolean(process.env.HUBSPOT_PRIVATE_APP_TOKEN?.trim() ?? ""),
              source: process.env.HUBSPOT_PRIVATE_APP_TOKEN?.trim() ? "env" : "none",
              masked: (process.env.HUBSPOT_PRIVATE_APP_TOKEN?.trim() ?? "")
                ? maskSecret(process.env.HUBSPOT_PRIVATE_APP_TOKEN?.trim() ?? "")
                : null,
              canEdit: false,
            },
            warning:
              "Database table `company_integrations` is not set up. Apply `supabase/integrations.sql` in your Supabase project to manage API keys from the UI.",
          },
          { status: 200 }
        );
      }
      throw new Error(rowError.message ?? "Failed to load integrations");
    }

    const dbKey = (row?.mailerlite_api_key as string | null)?.trim() ?? "";
    const envKey = process.env.MAILERLITE_API_KEY?.trim() ?? "";
    const effective = dbKey || envKey;
    const source = dbKey ? "db" : envKey ? "env" : "none";

    const dbHubspot = (row as Record<string, unknown> | null)?.hubspot_private_app_token;
    const dbHubspotKey = typeof dbHubspot === "string" ? dbHubspot.trim() : "";
    const envHubspotKey = process.env.HUBSPOT_PRIVATE_APP_TOKEN?.trim() ?? "";
    const effectiveHubspot = dbHubspotKey || envHubspotKey;
    const sourceHubspot = dbHubspotKey ? "db" : envHubspotKey ? "env" : "none";

    return NextResponse.json({
      mailerlite: {
        configured: Boolean(effective),
        source,
        masked: effective ? maskSecret(effective) : null,
        canEdit: true,
      },
      hubspot: {
        configured: Boolean(effectiveHubspot),
        source: sourceHubspot,
        masked: effectiveHubspot ? maskSecret(effectiveHubspot) : null,
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
      | {
          mailerlite_api_key?: string | null;
          hubspot_private_app_token?: string | null;
        }
      | null;

    const admin = createSupabaseAdminClient();
    const companyId = await getPrimaryCompanyId(admin);
    const allowed = await isAdmin(admin, companyId, user.id);
    if (!allowed) {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }

    const nextMailerLiteRaw = body?.mailerlite_api_key;
    const hasMailerLiteUpdate = typeof nextMailerLiteRaw === "string" || nextMailerLiteRaw === null;
    const nextMailerLiteKey =
      typeof nextMailerLiteRaw === "string" ? nextMailerLiteRaw.trim() : "";

    const nextHubspotRaw = body?.hubspot_private_app_token;
    const hasHubspotUpdate = typeof nextHubspotRaw === "string" || nextHubspotRaw === null;
    const nextHubspotKey = typeof nextHubspotRaw === "string" ? nextHubspotRaw.trim() : "";

    const update: Record<string, unknown> = { company_id: companyId };
    if (hasMailerLiteUpdate) {
      update.mailerlite_api_key = nextMailerLiteKey ? nextMailerLiteKey : null;
    }
    if (hasHubspotUpdate) {
      update.hubspot_private_app_token = nextHubspotKey ? nextHubspotKey : null;
    }

    const { error: upsertError } = await admin.from("company_integrations").upsert(update);
    if (upsertError) {
      const message = upsertError.message ?? "Failed to update integrations";
      if (isMissingCompanyIntegrationsTableError(message)) {
        return NextResponse.json(
          {
            error:
              "Database table `company_integrations` is not set up. Apply `supabase/integrations.sql` in your Supabase project (SQL Editor), then try again. Until then, use `MAILERLITE_API_KEY` env var.",
          },
          { status: 409 }
        );
      }
      if (hasHubspotUpdate && /hubspot_private_app_token/i.test(message)) {
        return NextResponse.json(
          {
            error:
              "HubSpot token storage is not available in the database yet. Apply `supabase/integrations.sql` (adds `company_integrations.hubspot_private_app_token`) or use `HUBSPOT_PRIVATE_APP_TOKEN` env var.",
          },
          { status: 409 }
        );
      }
      throw new Error(message);
    }

    if (hasMailerLiteUpdate) invalidateMailerLiteApiKeyCache();
    if (hasHubspotUpdate) invalidateHubspotAccessTokenCache();

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update integrations.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
