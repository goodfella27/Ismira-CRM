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

function scrubKnownBreezyFooterBlocks(html: string) {
  let next = html;

  // Remove "Last updated: ..." paragraph/line.
  next = next.replace(/<p[^>]*>\s*Last updated:\s*[\s\S]*?<\/p>/gi, "");
  next = next.replace(/Last updated:\s*[^<\n]+/gi, "");

  // Remove Breezy "apply" boilerplate blocks and the general application URL.
  next = next.replace(
    /<p[^>]*>\s*You can submit your Resume[\s\S]*?<\/p>/gi,
    ""
  );
  next = next.replace(
    /<p[^>]*>\s*If you are not sure what position to apply for[\s\S]*?<\/p>/gi,
    ""
  );
  next = next.replace(
    /https?:\/\/ismira\.breezy\.hr\/p\/[a-z0-9-]*general-application[^\s<"]*/gi,
    ""
  );

  // Clean up empty paragraphs left behind.
  next = next.replace(/<p[^>]*>\s*<\/p>/gi, "");
  next = next.replace(/(\s*<br\s*\/?>\s*){3,}/gi, "<br><br>");

  return next.trim();
}

export function scrubBreezyPositionDetails(details: unknown) {
  if (!details || typeof details !== "object" || Array.isArray(details)) return details;
  const record = details as Record<string, unknown>;
  const keys = ["description", "job_description", "jobDescription", "content", "html"] as const;

  let changed = false;
  const next: Record<string, unknown> = { ...record };

  for (const key of keys) {
    const value = next[key];
    if (typeof value !== "string" || !value.trim()) continue;
    const scrubbed = scrubKnownBreezyFooterBlocks(value);
    if (scrubbed !== value) {
      next[key] = scrubbed;
      changed = true;
    }
  }

  return changed ? next : details;
}
