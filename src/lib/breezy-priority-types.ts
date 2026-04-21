export type BreezyPriorityType = {
  key: string;
  label: string;
  sortOrder: number;
};

export const DEFAULT_BREEZY_PRIORITY_TYPES: BreezyPriorityType[] = [
  { key: "hot", label: "Hot", sortOrder: 0 },
  { key: "urgent", label: "Urgent", sortOrder: 1 },
];

function titleCaseWord(value: string) {
  const word = value.trim();
  if (!word) return "";
  return word.slice(0, 1).toUpperCase() + word.slice(1).toLowerCase();
}

export function humanizePriorityKey(value: string) {
  const key = value.trim().toLowerCase();
  if (!key) return "";
  return key
    .split(/[-_\s]+/g)
    .filter(Boolean)
    .map(titleCaseWord)
    .join(" ");
}

export function normalizePriorityKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export function sortPriorityTypes(list: BreezyPriorityType[]) {
  return [...list].sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.label.localeCompare(b.label, undefined, { sensitivity: "base" });
  });
}

export function dedupePriorityTypes(list: BreezyPriorityType[]) {
  const seen = new Set<string>();
  const normalized: BreezyPriorityType[] = [];
  for (const item of sortPriorityTypes(list)) {
    const key = normalizePriorityKey(item.key);
    const label = item.label.trim();
    if (!key || !label || seen.has(key)) continue;
    seen.add(key);
    normalized.push({
      key,
      label,
      sortOrder: Number.isFinite(item.sortOrder) ? item.sortOrder : normalized.length,
    });
  }
  return normalized;
}

export function getPriorityLabel(
  key: string,
  options: Array<Pick<BreezyPriorityType, "key" | "label">>
) {
  const normalized = normalizePriorityKey(key);
  if (!normalized) return "";
  const match = options.find((item) => normalizePriorityKey(item.key) === normalized);
  return match?.label?.trim() || humanizePriorityKey(normalized);
}
