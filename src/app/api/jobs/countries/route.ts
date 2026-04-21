import { NextResponse } from "next/server";

import { requireBreezyCompanyId } from "@/lib/breezy";
import { getPrimaryCompanyId } from "@/lib/company/primary";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { applyPublicCacheControl } from "@/lib/http/public-api";

export const runtime = "nodejs";

const CACHE_CONTROL = "public, max-age=300, stale-while-revalidate=3600";

function applyPublicCors(headers: Headers) {
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, ngrok-skip-browser-warning");
  headers.set("Access-Control-Max-Age", "86400");
  headers.set("X-Jobs-Cors", "1");
}

function isValidJsonpCallback(value: string) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(value);
}

function jsonResponse(request: Request, body: unknown, init: { status: number }) {
  const url = new URL(request.url);
  const callback = (url.searchParams.get("callback") ?? "").trim();
  if (callback && isValidJsonpCallback(callback)) {
    const payload = `${callback}(${JSON.stringify(body)});`;
    const res = new NextResponse(payload, { status: init.status });
    res.headers.set("Content-Type", "application/javascript; charset=utf-8");
    applyPublicCors(res.headers);
    if (init.status >= 400) applyPublicCacheControl(res.headers, "no-store");
    else applyPublicCacheControl(res.headers, CACHE_CONTROL);
    return res;
  }

  const res = NextResponse.json(body, init);
  applyPublicCors(res.headers);
  if (init.status >= 400) applyPublicCacheControl(res.headers, "no-store");
  else applyPublicCacheControl(res.headers, CACHE_CONTROL);
  return res;
}

export async function OPTIONS() {
  const res = new NextResponse(null, { status: 204 });
  applyPublicCors(res.headers);
  applyPublicCacheControl(res.headers, "public, max-age=86400");
  return res;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const companyParam = (searchParams.get("companyId") ?? "").trim();
    const breezyCompanyId = companyParam || requireBreezyCompanyId().companyId;

    const admin = createSupabaseAdminClient();
    const primaryCompanyId = await getPrimaryCompanyId(admin);

    const { data: publishedRows } = await admin
      .from("breezy_positions")
      .select("breezy_position_id")
      .eq("company_id", primaryCompanyId)
      .eq("breezy_company_id", breezyCompanyId)
      .eq("state", "published");

    const published = new Set(
      (Array.isArray(publishedRows) ? publishedRows : [])
        .map((row) => (row as { breezy_position_id?: string }).breezy_position_id ?? "")
        .filter(Boolean)
    );

    const { data, error } = await admin
      .from("breezy_position_countries")
      .select("breezy_position_id,country_code,country_name,group")
      .eq("company_id", primaryCompanyId)
      .eq("breezy_company_id", breezyCompanyId);

    if (error) {
      const message = error.message ?? "Failed to load countries";
      return jsonResponse(request, { error: message }, { status: 500 });
    }

    type Row = {
      breezy_position_id: string;
      country_code: string;
      country_name: string | null;
      group: "processable" | "blocked" | "mentioned";
    };

    const rows = (Array.isArray(data) ? (data as unknown as Row[]) : []).filter((row) =>
      published.has(row.breezy_position_id)
    );

    const byCode = new Map<
      string,
      { code: string; name: string; count: number; processable: number; blocked: number; mentioned: number }
    >();

    for (const row of rows) {
      const code = (row.country_code ?? "").toUpperCase().trim();
      if (!code) continue;
      const entry =
        byCode.get(code) ??
        {
          code,
          name: row.country_name?.trim() || code,
          count: 0,
          processable: 0,
          blocked: 0,
          mentioned: 0,
        };
      entry.count += 1;
      if (row.group === "processable") entry.processable += 1;
      else if (row.group === "blocked") entry.blocked += 1;
      else entry.mentioned += 1;
      if (row.country_name && !entry.name) entry.name = row.country_name.trim();
      byCode.set(code, entry);
    }

    const countries = Array.from(byCode.values()).sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
    );

    return jsonResponse(request, { countries }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse(request, { error: message }, { status: 500 });
  }
}

