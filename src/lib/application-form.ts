export type ApplicationLanguage = "en" | "lt" | "pl" | "uk" | "de" | "ru";
export const APPLICATION_EXPERIENCE = ["Ship or land-based experience (2+ years)", "Some experience (under 2 years)", "No direct experience"] as const;
export const APPLICATION_LEVELS = ["A1", "A2", "B1", "B2", "C1"] as const;
export const MAX_APPLICATION_CV_BYTES = 8 * 1024 * 1024;
export type ApplicationValues = {
  firstName: string; lastName: string; email: string; phone: string;
  department: string; desiredPosition: string; experience: string;
  isAdult: string; citizenship: string; englishLevel: string; consent: boolean;
};
export const EMPTY_APPLICATION: ApplicationValues = { firstName: "", lastName: "", email: "", phone: "", department: "", desiredPosition: "", experience: "", isAdult: "", citizenship: "", englishLevel: "", consent: false };
export const APPLICATION_STEPS = [["firstName", "lastName", "email", "phone"], ["department", "desiredPosition", "experience"], ["isAdult", "citizenship", "englishLevel"], ["consent"]] as const;
export function validateApplication(values: ApplicationValues, step: number) {
  const errors: Record<string, "required" | "email" | "phone" | "adult" | "invalid"> = {};
  for (const key of APPLICATION_STEPS[step] ?? []) {
    const value = values[key];
    if (value === false || (typeof value === "string" && !value.trim())) errors[key] = "required";
  }
  if (step === 0) {
    for (const key of ["firstName", "lastName"] as const) if (values[key] && !/^[\p{L}\p{M}][\p{L}\p{M}'’ .-]{0,79}$/u.test(values[key].trim())) errors[key] = "invalid";
    if (values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) errors.email = "email";
    if (values.phone && (!/^[+()\d\s-]{7,24}$/.test(values.phone.trim()) || values.phone.replace(/\D/g, "").length < 7)) errors.phone = "phone";
  }
  if (step === 1) {
    if (values.department && !["Hotel", "Technical"].includes(values.department)) errors.department = "invalid";
    if (values.experience && !(APPLICATION_EXPERIENCE as readonly string[]).includes(values.experience)) errors.experience = "invalid";
    if (values.desiredPosition && (values.desiredPosition.trim().length < 2 || values.desiredPosition.length > 120)) errors.desiredPosition = "invalid";
  }
  if (step === 2) {
    if (values.isAdult && !["Yes", "No"].includes(values.isAdult)) errors.isAdult = "invalid";
    if (values.englishLevel && !(APPLICATION_LEVELS as readonly string[]).includes(values.englishLevel)) errors.englishLevel = "invalid";
  }
  return errors;
}
export function validateApplicationCV(file: {name: string; size: number} | null) {
  if (!file) return null;
  if (!/\.(pdf|doc|docx)$/i.test(file.name)) return "fileType";
  if (!file.size || file.size > MAX_APPLICATION_CV_BYTES) return "fileSize";
  return null;
}

// Display stages are separate from the server's validation groups.
export const APPLICATION_WIZARD_FIELDS = [
  ["email", "firstName", "lastName", "phone"],
  ["department", "desiredPosition"],
  ["experience"],
  ["isAdult", "citizenship", "englishLevel"],
  ["consent"],
] as const;
export function validateApplicationStage(values: ApplicationValues, stage: number) {
  const validationGroup = [0, 1, 1, 2, 3][stage];
  const errors = validateApplication(values, validationGroup);
  const fields: readonly string[] = APPLICATION_WIZARD_FIELDS[stage] ?? [];
  return Object.fromEntries(Object.entries(errors).filter(([key]) => fields.includes(key)));
}
