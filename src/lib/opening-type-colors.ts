import { normalizePriorityKey } from "./breezy-priority-types";

type OpeningType = { key: string; label: string };
const styles = {
  orange: { badge: "bg-gradient-to-r from-[#ff9d2e] to-[#ffbf5f] text-white shadow-orange-200/40", text: "text-[#f28714]" },
  sky: { badge: "bg-gradient-to-r from-[#58d0d8] to-[#3ea4e6] text-white shadow-sky-200/50", text: "text-[#1d9bd7]" },
  violet: { badge: "bg-gradient-to-r from-[#8b5cf6] to-[#c084fc] text-white shadow-violet-200/40", text: "text-[#8b5cf6]" },
  pink: { badge: "bg-gradient-to-r from-[#ec4899] to-[#f9a8d4] text-white shadow-pink-200/40", text: "text-[#db2777]" },
};
export function getOpeningTypeColor(key: string, types: OpeningType[] = []): keyof typeof styles {
  const normalized = normalizePriorityKey(key);
  const index = types.findIndex(type => normalizePriorityKey(type.key) === normalized);
  const label = normalizePriorityKey(types[index]?.label || "");
  // Labels can be renamed while legacy keys are retained.
  for (const value of [label, normalized]) {
    if (value === "live-interview") return "pink";
    if (value.includes("urgent") || value === "priority-opening") return "orange";
    if (value.includes("regular") || value === "ongoing-interview" || value === "active-hiring") return "sky";
    if (value.includes("coming-soon") || value === "on-hold") return "violet";
  }
  return "pink";
}
export function getPriorityBadgeClass(key: string, types: OpeningType[] = []) {
  return key.trim() ? styles[getOpeningTypeColor(key, types)].badge : "";
}
export function getPriorityTextClass(key: string, types: OpeningType[] = []) {
  return key.trim() ? styles[getOpeningTypeColor(key, types)].text : "text-slate-800";
}
