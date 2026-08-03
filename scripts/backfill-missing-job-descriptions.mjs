#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

import {
  buildBackfilledDetails,
  buildPublicPostingUrl,
  extractJobPostingDescription,
  hasVisibleBody,
} from "../src/lib/public-job-description-backfill.mjs";

export function parseArgs(argv) {
  const args = {
    apply: false,
    includeUnpublished: false,
    limit: null,
    sourceBaseUrl: "",
  };

  for (const arg of argv) {
    if (arg === "--apply") {
      args.apply = true;
      continue;
    }
    if (arg === "--include-unpublished") {
      args.includeUnpublished = true;
      continue;
    }
    if (arg.startsWith("--limit=")) {
      const value = Number(arg.slice("--limit=".length));
      if (!Number.isInteger(value) || value < 0) {
        throw new Error("--limit must be a non-negative integer");
      }
      args.limit = value;
      continue;
    }
    if (arg.startsWith("--source-base-url=")) {
      args.sourceBaseUrl = arg.slice("--source-base-url=".length).trim();
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  args.sourceBaseUrl =
    args.sourceBaseUrl ||
    process.env.PUBLIC_JOBS_SOURCE_BASE_URL ||
    process.env.BREEZY_PUBLIC_JOBS_BASE_URL ||
    "";

  if (!args.sourceBaseUrl) {
    throw new Error(
      "Missing source URL. Pass --source-base-url=https://example.com or set PUBLIC_JOBS_SOURCE_BASE_URL."
    );
  }

  return args;
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]]) continue;
    let value = match[2].trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

function createAdminClient() {
  loadEnvFile(path.join(process.cwd(), ".env.local"));
  loadEnvFile(path.join(process.cwd(), ".env"));

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error("Missing Supabase URL/key environment variables.");
  }

  return createClient(url, key, { auth: { persistSession: false } });
}

function isPool(row) {
  return String(row?.org_type ?? "").trim().toLowerCase() === "pool";
}

function isPublished(row) {
  return String(row?.state ?? "").trim().toLowerCase() === "published";
}

function companyLabel(row) {
  return String(row?.company ?? "").trim() || "No company";
}

async function fetchAllPositions(admin) {
  const columns = [
    "company_id",
    "breezy_company_id",
    "breezy_position_id",
    "name",
    "state",
    "friendly_id",
    "org_type",
    "company",
    "department",
    "details",
    "overrides",
    "synced_at",
    "details_synced_at",
  ].join(",");

  const pageSize = 1000;
  const rows = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await admin
      .from("breezy_positions")
      .select(columns)
      .range(from, from + pageSize - 1)
      .order("company", { ascending: true })
      .order("name", { ascending: true });

    if (error) throw new Error(error.message ?? "Failed to load Supabase positions");
    const page = Array.isArray(data) ? data : [];
    rows.push(...page);
    if (page.length < pageSize) break;
  }

  return rows;
}

async function fetchPublicDescription(sourceUrl) {
  const response = await fetch(sourceUrl, {
    headers: {
      accept: "text/html,application/xhtml+xml",
      "user-agent": "ISMIRA-JD-backfill/1.0",
    },
  });

  if (!response.ok) {
    return {
      status: "skipped",
      reason: `public page returned ${response.status}`,
    };
  }

  const html = await response.text();
  const extracted = extractJobPostingDescription(html);
  if (!extracted) {
    return {
      status: "skipped",
      reason: "no structured JobPosting description found",
    };
  }

  return { status: "recoverable", extracted };
}

function printSummary(result) {
  const countsByCompany = result.recoverable.reduce((acc, item) => {
    const label = companyLabel(item.row);
    acc[label] = (acc[label] || 0) + 1;
    return acc;
  }, {});

  const skippedByReason = result.skipped.reduce((acc, item) => {
    acc[item.reason] = (acc[item.reason] || 0) + 1;
    return acc;
  }, {});

  console.log(JSON.stringify(
    {
      mode: result.apply ? "apply" : "dry-run",
      total_rows_scanned: result.totalRows,
      missing_body_rows: result.missingRows,
      recoverable: result.recoverable.length,
      updated: result.updated.length,
      skipped: result.skipped.length,
      failed: result.failed.length,
      recoverable_by_company: countsByCompany,
      skipped_by_reason: skippedByReason,
      sample_recoverable: result.recoverable.slice(0, 10).map((item) => ({
        company: companyLabel(item.row),
        name: item.row.name,
        id: item.row.breezy_position_id,
        source_url: item.sourceUrl,
        text_length: item.extracted.text.length,
        html_length: item.extracted.html.length,
      })),
      sample_skipped: result.skipped.slice(0, 10).map((item) => ({
        company: companyLabel(item.row),
        name: item.row.name,
        id: item.row.breezy_position_id,
        source_url: item.sourceUrl,
        reason: item.reason,
      })),
      sample_failed: result.failed.slice(0, 10).map((item) => ({
        company: companyLabel(item.row),
        name: item.row.name,
        id: item.row.breezy_position_id,
        source_url: item.sourceUrl,
        reason: item.reason,
      })),
    },
    null,
    2
  ));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const admin = createAdminClient();
  const rows = await fetchAllPositions(admin);
  const missingRows = rows
    .filter((row) => !isPool(row))
    .filter((row) => args.includeUnpublished || isPublished(row))
    .filter((row) => !hasVisibleBody(row.details));
  const missing = args.limit === null ? missingRows : missingRows.slice(0, args.limit);

  const result = {
    apply: args.apply,
    totalRows: rows.length,
    missingRows: missingRows.length,
    recoverable: [],
    skipped: [],
    failed: [],
    updated: [],
  };

  for (const row of missing) {
    let sourceUrl = "";
    try {
      sourceUrl = buildPublicPostingUrl(args.sourceBaseUrl, row);
      const fetched = await fetchPublicDescription(sourceUrl);

      if (fetched.status !== "recoverable") {
        result.skipped.push({ row, sourceUrl, reason: fetched.reason });
        continue;
      }

      result.recoverable.push({ row, sourceUrl, extracted: fetched.extracted });

      if (!args.apply) continue;

      const now = new Date().toISOString();
      const details = buildBackfilledDetails(row, fetched.extracted, sourceUrl, now);
      const { error } = await admin
        .from("breezy_positions")
        .update({
          details,
          details_synced_at: now,
          synced_at: now,
        })
        .eq("company_id", row.company_id)
        .eq("breezy_position_id", row.breezy_position_id);

      if (error) {
        result.failed.push({ row, sourceUrl, reason: error.message ?? "update failed" });
        continue;
      }

      result.updated.push({ row, sourceUrl });
    } catch (error) {
      result.failed.push({
        row,
        sourceUrl,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  printSummary(result);

  if (result.failed.length > 0 && args.apply) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
