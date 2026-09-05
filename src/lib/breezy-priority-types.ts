export type BreezyPriorityType = {
  key: string;
  label: string;
  tooltip?: string;
  sortOrder: number;
  showOnFrontpage: boolean;
};

export const DEFAULT_BREEZY_PRIORITY_TYPES: BreezyPriorityType[] = [
  { key: "ongoing-interview", label: "Ongoing Interview", sortOrder: 0, showOnFrontpage: true },
  { key: "urgent-joining", label: "Urgent Joining", sortOrder: 1, showOnFrontpage: true },
  { key: "on-hold", label: "On Hold", sortOrder: 2, showOnFrontpage: false },
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

export function getDefaultPriorityFrontpageVisibility(key: string, label: string) {
  const normalizedKey = normalizePriorityKey(key);
  const normalizedLabel = normalizePriorityKey(label);
  if (normalizedKey === "on-hold" || normalizedLabel === "on-hold") return false;
  return (
    normalizedKey === "ongoing-interview" ||
    normalizedKey === "urgent-joining" ||
    normalizedLabel === "ongoing-interview" ||
    normalizedLabel === "urgent-joining"
  );
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
      tooltip: item.tooltip,
      sortOrder: Number.isFinite(item.sortOrder) ? item.sortOrder : normalized.length,
      showOnFrontpage:
        typeof item.showOnFrontpage === "boolean"
          ? item.showOnFrontpage
          : getDefaultPriorityFrontpageVisibility(key, label),
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

export function getPriorityTooltip(type: Pick<BreezyPriorityType, "key" | "label" | "tooltip">) {
  if (typeof type.tooltip === "string") return type.tooltip.trim();
  const values = [normalizePriorityKey(type.label), normalizePriorityKey(type.key)];
  if (values.some(value => value.includes("urgent") || value === "priority-opening")) return "Hiring with priority - urgent requisition";
  if (values.some(value => value.includes("regular") || value === "active-hiring" || value === "ongoing-interview")) return "Interviews are ongoing - placement when required";
  if (values.some(value => value === "coming-soon" || value === "on-hold")) return "Not open yet - apply now to be considered when hiring begins";
  return "";
}
