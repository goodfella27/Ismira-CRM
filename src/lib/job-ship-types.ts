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

export function getJobShipTypeLabel(value: unknown) {
  const type = normalizeJobShipType(value);
  return type ? JOB_SHIP_TYPE_LABELS[type] : "";
}

export function getMetadataShipType(metadata: unknown): JobShipType | "" {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return "";
  return normalizeJobShipType((metadata as Record<string, unknown>).ship_type);
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
  return getMetadataShipType(init.metadata) || inferJobShipTypeFromText(init.name, init.fallback);
}
