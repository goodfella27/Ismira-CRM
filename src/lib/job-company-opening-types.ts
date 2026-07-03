import { normalizePriorityKey } from "@/lib/breezy-priority-types";

export const JOB_COMPANY_OPENING_TYPE_METADATA_KEY = "job_company_opening_type";

export type OpeningTypeOverride = string | null | undefined;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function getMetadataOpeningType(metadata: unknown) {
  if (!isRecord(metadata)) return "";
  return normalizePriorityKey(
    asString(metadata[JOB_COMPANY_OPENING_TYPE_METADATA_KEY]) ||
      asString(metadata.opening_type) ||
      asString(metadata.openingType)
  );
}

export function getPositionOpeningTypeOverride(overrides: unknown): OpeningTypeOverride {
  if (!isRecord(overrides)) return undefined;
  if (!Object.prototype.hasOwnProperty.call(overrides, "priority")) return undefined;

  const value = overrides.priority;
  if (value === null) return null;
  if (typeof value !== "string") return undefined;

  const normalized = normalizePriorityKey(value);
  return normalized || undefined;
}

export function resolveOpeningType(init: {
  metadata?: unknown;
  override?: OpeningTypeOverride;
}) {
  if (init.override === null) return "";
  if (typeof init.override === "string") return normalizePriorityKey(init.override);
  return getMetadataOpeningType(init.metadata);
}
