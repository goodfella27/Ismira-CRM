export const JOB_SHIP_TYPES = ["sea_ship", "river_ship"] as const;

export type JobShipType = (typeof JOB_SHIP_TYPES)[number];

export const JOB_SHIP_TYPE_LABELS: Record<JobShipType, string> = {
  sea_ship: "Ocean Ship",
  river_ship: "River Ship",
};

export function normalizeJobShipType(value: unknown): JobShipType | "" {
  if (typeof value !== "string") return "";
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (normalized === "sea" || normalized === "sea_ship" || normalized === "ocean") {
    return "sea_ship";
  }
  if (normalized === "river" || normalized === "river_ship" || normalized === "riverboat") {
    return "river_ship";
  }
  return "";
}

export function normalizeJobShipTypes(value: unknown): JobShipType[] {
  const rawValues = Array.isArray(value)
    ? value
    : typeof value === "string" && value.trim().startsWith("[")
      ? (() => {
          try {
            const parsed = JSON.parse(value) as unknown;
            return Array.isArray(parsed) ? parsed : [value];
          } catch {
            return [value];
          }
        })()
      : typeof value === "string" && value.includes(",")
        ? value.split(",")
        : [value];

  const selected = new Set<JobShipType>();
  for (const item of rawValues) {
    const type = normalizeJobShipType(item);
    if (type) selected.add(type);
  }

  return JOB_SHIP_TYPES.filter((type) => selected.has(type));
}

export function getJobShipTypeLabel(value: unknown) {
  const type = normalizeJobShipType(value);
  return type ? JOB_SHIP_TYPE_LABELS[type] : "";
}

export function getJobShipTypeLabels(value: unknown) {
  return normalizeJobShipTypes(value).map((type) => JOB_SHIP_TYPE_LABELS[type]);
}

export function getMetadataShipType(metadata: unknown): JobShipType | "" {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return "";
  return getMetadataShipTypes(metadata)[0] ?? "";
}

export function getMetadataShipTypes(metadata: unknown): JobShipType[] {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return [];
  const record = metadata as Record<string, unknown>;
  const shipTypes = normalizeJobShipTypes(record.ship_types);
  return shipTypes.length > 0 ? shipTypes : normalizeJobShipTypes(record.ship_type);
}

export function inferJobShipTypeFromText(...values: unknown[]): JobShipType | "" {
  const text = values
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();

  if (!text.trim()) return "";

  if (
    /\briver\b/.test(text) ||
    /\briverboat\b/.test(text) ||
    /\binland waterways?\b/.test(text) ||
    /\b(danube|rhine|seine|douro|moselle|main river|mekong|nile)\b/.test(text)
  ) {
    return "river_ship";
  }

  if (
    /\bsea\b/.test(text) ||
    /\bocean\b/.test(text) ||
    /\bcruise line\b/.test(text) ||
    /\bcruise ship\b/.test(text) ||
    /\bcruise liner\b/.test(text) ||
    /\b(carnival|virgin voyages|costa|astoria|margaritaville|msc|royal caribbean|norwegian)\b/.test(text)
  ) {
    return "sea_ship";
  }

  return "";
}

export function resolveJobShipType(init: { metadata?: unknown; name?: unknown; fallback?: unknown }) {
  return resolveJobShipTypes(init)[0] ?? "";
}

export function resolveJobShipTypes(init: { metadata?: unknown; name?: unknown; fallback?: unknown }) {
  const metadataTypes = getMetadataShipTypes(init.metadata);
  if (metadataTypes.length > 0) return metadataTypes;
  return normalizeJobShipTypes(inferJobShipTypeFromText(init.name, init.fallback));
}
