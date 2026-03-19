import { stages } from "@/app/pipeline/data";
import type { Candidate } from "@/app/pipeline/types";

export type BreezyCsvRow = {
  name: string;
  match_score: string;
  score: string;
  email: string;
  phone: string;
  address: string;
  desired_salary: string;
  position: string;
  stage: string;
  source: string;
  sourced_by: string;
  addedDate: string;
  addedTime: string;
  lastActivityDate: string;
  lastActivityTime: string;
};

const DEFAULT_STAGE_ID = stages.find((stage) => stage.order === 0)?.id ?? "consultation";

const stageIndex = new Map<string, string>(
  stages.flatMap((stage) => [
    [normalizeStage(stage.id), stage.id],
    [normalizeStage(stage.name), stage.id],
  ])
);

function normalizeStage(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const char = text[i];

    if (inQuotes) {
      if (char === "\"") {
        if (text[i + 1] === "\"") {
          field += "\"";
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else {
      if (char === "\"") {
        inQuotes = true;
      } else if (char === ",") {
        row.push(field);
        field = "";
      } else if (char === "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else if (char === "\r") {
        if (text[i + 1] === "\n") {
          i += 1;
        }
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else {
        field += char;
      }
    }

    i += 1;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function buildRow(headers: string[], values: string[]): BreezyCsvRow {
  const index = new Map(headers.map((header, i) => [header, i]));
  const read = (key: keyof BreezyCsvRow) => {
    const value = values[index.get(key) ?? -1] ?? "";
    return value.trim();
  };

  return {
    name: read("name"),
    match_score: read("match_score"),
    score: read("score"),
    email: read("email"),
    phone: read("phone"),
    address: read("address"),
    desired_salary: read("desired_salary"),
    position: read("position"),
    stage: read("stage"),
    source: read("source"),
    sourced_by: read("sourced_by"),
    addedDate: read("addedDate"),
    addedTime: read("addedTime"),
    lastActivityDate: read("lastActivityDate"),
    lastActivityTime: read("lastActivityTime"),
  };
}

function parseScore(value: string) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function extractCountryFromAddress(address: string) {
  if (!address) return undefined;
  const parts = address
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return undefined;
  return parts[parts.length - 1];
}

export function parseBreezyCsv(text: string): BreezyCsvRow[] {
  const rows = parseCsv(text);
  if (rows.length === 0) return [];

  const headers = rows[0].map((header) => header.trim());
  if (headers.length === 0) return [];
  if (headers[0] && headers[0].charCodeAt(0) === 0xfeff) {
    headers[0] = headers[0].slice(1);
  }

  const dataRows = rows.slice(1);

  return dataRows
    .map((values) => buildRow(headers, values))
    .filter((row) => Object.values(row).some((value) => value));
}

export function resolveBreezyStageId(rawStage: string) {
  if (!rawStage) return DEFAULT_STAGE_ID;
  const normalized = normalizeStage(rawStage);
  return stageIndex.get(normalized) ?? DEFAULT_STAGE_ID;
}

export function parseBreezyDateTime(dateValue: string, timeValue: string) {
  if (!dateValue) return null;
  const normalized = `${dateValue}T${timeValue || "00:00:00"}`;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function buildCandidateId(seed: string) {
  if (!seed) return `bz-${crypto.randomUUID()}`;
  const encoded = Buffer.from(seed.toLowerCase()).toString("base64url");
  return `bz-${encoded}`;
}

export function mapBreezyRowToCandidate(
  row: BreezyCsvRow,
  options: { poolId: string; now: string; pipelineId: string }
): Candidate {
  const email = row.email || `unknown-${crypto.randomUUID()}@breezy.local`;
  const createdAt =
    parseBreezyDateTime(row.addedDate, row.addedTime) ?? options.now;
  const updatedAt =
    parseBreezyDateTime(row.lastActivityDate, row.lastActivityTime) ??
    createdAt;
  const stageId = resolveBreezyStageId(row.stage);
  const country = extractCountryFromAddress(row.address);

  return {
    id: buildCandidateId(email),
    name: row.name || email,
    email,
    phone: row.phone || undefined,
    avatar_url: null,
    pipeline_id: options.pipelineId,
    pool_id: options.poolId,
    stage_id: stageId,
    country,
    status: "active",
    created_at: createdAt,
    updated_at: updatedAt,
    order: 0,
    source: "Breezy",
    desired_position: row.position || undefined,
    breezy: {
      match_score: row.match_score,
      score: row.score,
      address: row.address,
      desired_salary: row.desired_salary,
      position: row.position,
      stage: row.stage,
      source: row.source,
      sourced_by: row.sourced_by,
      addedDate: row.addedDate,
      addedTime: row.addedTime,
      lastActivityDate: row.lastActivityDate,
      lastActivityTime: row.lastActivityTime,
    },
  };
}

export function mapBreezyRowToSupabase(row: BreezyCsvRow) {
  return {
    name: row.name || null,
    match_score: parseScore(row.match_score),
    score: parseScore(row.score),
    email: row.email || null,
    phone: row.phone || null,
    address: row.address || null,
    desired_salary: row.desired_salary || null,
    position: row.position || null,
    stage: row.stage || null,
    source: row.source || null,
    sourced_by: row.sourced_by || null,
    addedDate: row.addedDate || null,
    addedTime: row.addedTime || null,
    lastActivityDate: row.lastActivityDate || null,
    lastActivityTime: row.lastActivityTime || null,
  };
}
