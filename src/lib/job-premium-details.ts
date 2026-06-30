export type JobPremiumDetails = {
  salaryText: string;
  tipsText: string;
  positionCompensationType: "" | "tipping" | "non_tipping";
  contractLength: string;
  stripes: "" | "1" | "1.5" | "2";
  cabinType: "" | "single" | "shared";
  salaryNote: string;
  additionalInfo: string;
};

export const POSITION_COMPENSATION_LABELS = {
  tipping: "Tipping position",
  non_tipping: "Non-tipping position",
} as const;

export const CABIN_TYPE_LABELS = {
  single: "Single cabin",
  shared: "Shared cabin",
} as const;

export const EMPTY_JOB_PREMIUM_DETAILS: JobPremiumDetails = {
  salaryText: "",
  tipsText: "",
  positionCompensationType: "",
  contractLength: "",
  stripes: "",
  cabinType: "",
  salaryNote: "",
  additionalInfo: "",
};

export function normalizePremiumText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.replace(/\r\n/g, "\n").trim().slice(0, maxLength) : "";
}

export function normalizeJobPremiumDetails(value: unknown): JobPremiumDetails {
  const record =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};

  const positionCompensationTypeRaw = normalizePremiumText(
    record.positionCompensationType ?? record.position_compensation_type,
    32
  );
  const stripesRaw = normalizePremiumText(record.stripes, 8);
  const cabinTypeRaw = normalizePremiumText(record.cabinType ?? record.cabin_type, 24);

  return {
    salaryText: normalizePremiumText(record.salaryText ?? record.salary_text, 500),
    tipsText: normalizePremiumText(record.tipsText ?? record.tips_text, 500),
    positionCompensationType:
      positionCompensationTypeRaw === "tipping" ||
      positionCompensationTypeRaw === "non_tipping"
        ? positionCompensationTypeRaw
        : "",
    contractLength: normalizePremiumText(
      record.contractLength ?? record.contract_length,
      200
    ),
    stripes:
      stripesRaw === "1" || stripesRaw === "1.5" || stripesRaw === "2"
        ? stripesRaw
        : "",
    cabinType:
      cabinTypeRaw === "single" || cabinTypeRaw === "shared" ? cabinTypeRaw : "",
    salaryNote: normalizePremiumText(record.salaryNote ?? record.salary_note, 500),
    additionalInfo: normalizePremiumText(
      record.additionalInfo ?? record.additional_info,
      5000
    ),
  };
}

export function hasJobPremiumDetails(details: JobPremiumDetails) {
  return Boolean(
    details.salaryText ||
      details.tipsText ||
      details.positionCompensationType ||
      details.contractLength ||
      details.stripes ||
      details.cabinType ||
      details.salaryNote ||
      details.additionalInfo
  );
}
