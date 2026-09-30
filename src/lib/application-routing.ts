import { APPLICATION_EXPERIENCE, APPLICATION_LEVELS } from "@/lib/application-form";
import { applicationCountryCodes } from "@/app/apply/countries";
import { PDF_PRIMARY_COUNTRIES, PDF_FOLLOWUP_COUNTRIES } from "@/lib/application-country-segments";

export const COMMUNICATION_BUCKETS = [
  { key: "age_followup", label: "Under-18 communication", description: "Applicant selects No for the 18+ question.", suggestedGroup: "APPLICATION NOT APPROVED" },
  { key: "country_followup", label: "PDF red-list communication", description: "Citizenship is one of the 196 countries in the PDF red list.", suggestedGroup: "APPLICATION NOT APPROVED" },
  { key: "unlisted", label: "Country not listed in PDF", description: "Austria, Cambodia, or Saint Pierre and Miquelon. Choose a separate follow-up destination.", suggestedGroup: "" },
  { key: "improvement", label: "Experience / English follow-up", description: "PDF green list, age 18+, and either no direct experience or English A1–A2.", suggestedGroup: "NEED IMPROVEMENT" },
  { key: "main", label: "Main communication", description: "PDF green list, age 18+, some or ship / 2+ years of experience, and English B1–C1.", suggestedGroup: "Ismira Main Collection" },
] as const;
export type CommunicationBucket = typeof COMMUNICATION_BUCKETS[number]["key"];
export type RoutingSettings = { enabled: boolean; groups: Record<CommunicationBucket, string> };
export const EMPTY_ROUTING_SETTINGS: RoutingSettings = {
  enabled: false, groups: { age_followup: "", country_followup: "", unlisted: "", improvement: "", main: "" },
};
export function parseRoutingSettings(input: unknown): RoutingSettings {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid routing settings.");
  const raw = input as Record<string, unknown>;
  if (typeof raw.enabled !== "boolean" || !raw.groups || typeof raw.groups !== "object" || Array.isArray(raw.groups)) throw new Error("Invalid routing settings.");
  const groups = {} as RoutingSettings["groups"];
  for (const { key } of COMMUNICATION_BUCKETS) {
    const id = (raw.groups as Record<string, unknown>)[key] ?? "";
    if (typeof id !== "string" || (id !== "" && !/^\d{1,30}$/.test(id)) || (raw.enabled && !id)) throw new Error(`Choose a valid MailerLite group for ${key}.`);
    groups[key] = id;
  }
  return { enabled: raw.enabled, groups };
}
export type CommunicationInput = { citizenship: string; isAdult: string; experience: string; englishLevel: string };
export function classifyApplicationCommunication(input: CommunicationInput): CommunicationBucket {
  if (!applicationCountryCodes.includes(input.citizenship) || !["Yes", "No"].includes(input.isAdult) ||
      !(APPLICATION_EXPERIENCE as readonly string[]).includes(input.experience) || !(APPLICATION_LEVELS as readonly string[]).includes(input.englishLevel)) {
    throw new Error("Invalid communication routing inputs.");
  }
  if (input.isAdult === "No") return "age_followup";
  if (PDF_FOLLOWUP_COUNTRIES.includes(input.citizenship)) return "country_followup";
  if (!PDF_PRIMARY_COUNTRIES.includes(input.citizenship)) return "unlisted";
  if (input.experience === APPLICATION_EXPERIENCE[2] || ["A1", "A2"].includes(input.englishLevel)) return "improvement";
  return "main";
}
