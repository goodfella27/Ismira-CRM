export type QuestionnaireStatus = "Active" | "Draft";

export type Questionnaire = {
  id: string;
  name: string;
  status: QuestionnaireStatus;
};

export const QUESTIONNAIRE_STORAGE_KEY = "ismira.questionnaires.v1";

export const DEFAULT_QUESTIONNAIRES: Questionnaire[] = [
  { id: "general-screening", name: "General screening", status: "Active" },
  { id: "seafarer-pre-check", name: "Seafarer pre-check", status: "Draft" },
];

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

export const buildQuestionnaireId = (base: string, existing: Set<string>) => {
  const normalized = slugify(base) || "questionnaire";
  if (!existing.has(normalized)) return normalized;
  let index = 2;
  while (existing.has(`${normalized}-${index}`)) {
    index += 1;
  }
  return `${normalized}-${index}`;
};

export const normalizeQuestionnaires = (raw: unknown): Questionnaire[] => {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((item, index) => {
      if (!item || typeof item !== "object") return null;
      const value = item as Record<string, unknown>;
      const name = typeof value.name === "string" ? value.name.trim() : "";
      if (!name) return null;
      const id =
        typeof value.id === "string" && value.id.trim()
          ? value.id.trim()
          : `questionnaire-${index + 1}`;
      const status =
        value.status === "Active" || value.status === "Draft"
          ? value.status
          : "Draft";
      return { id, name, status };
    })
    .filter(Boolean) as Questionnaire[];
};

export const loadQuestionnaires = (): Questionnaire[] => {
  if (typeof window === "undefined") return DEFAULT_QUESTIONNAIRES;
  try {
    const stored = window.localStorage.getItem(QUESTIONNAIRE_STORAGE_KEY);
    if (!stored) return DEFAULT_QUESTIONNAIRES;
    const parsed = JSON.parse(stored);
    const normalized = normalizeQuestionnaires(parsed);
    return normalized.length > 0 ? normalized : DEFAULT_QUESTIONNAIRES;
  } catch {
    return DEFAULT_QUESTIONNAIRES;
  }
};

export const saveQuestionnaires = (next: Questionnaire[]) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      QUESTIONNAIRE_STORAGE_KEY,
      JSON.stringify(next)
    );
  } catch {
    // ignore storage errors
  }
};
