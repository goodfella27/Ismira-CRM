export function pickPositionDescription(
  details: Record<string, unknown> | null | undefined
): string {
  if (!details) return "";
  const keys = ["description", "job_description", "jobDescription", "content", "html"];
  for (const key of keys) {
    const value = details[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

