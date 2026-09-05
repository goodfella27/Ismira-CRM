export function pickPositionDescription(
  details: Record<string, unknown> | null | undefined
): string {
  if (!details) return "";
  const keys = ["description", "job_description", "jobDescription", "html", "content"];
  for (const key of keys) {
    const value = details[key];
    if (typeof value === "string" && hasVisibleDescriptionText(value)) return value.trim();
  }
  return "";
}

// Keep the editable description field separate; public readers need all JD sections.
export function buildPublicPositionDescription(
  details: Record<string, unknown> | null | undefined
): string {
  if (!details) return "";
  const description = pickPositionDescription(details);
  const sections: string[] = [];
  for (const [key, title] of [
    ["responsibilities", "Responsibilities"],
    ["requirements", "Requirements"],
  ]) {
    const value = [details[key], details[`${key}_html`], details[`${key}_text`]]
      .find((value): value is string =>
        typeof value === "string" && hasVisibleDescriptionText(value)
      );
    if (value) sections.push(`<h2>${title}</h2>\n${descriptionAsHtml(value)}`);
  }
  if (sections.length === 0) return description;
  return [description ? descriptionAsHtml(description) : "", ...sections]
    .filter(Boolean)
    .join("\n");
}

function descriptionAsHtml(value: string) {
  if (/<\/?[a-z][\s\S]*>/i.test(value)) return value.trim();
  const escaped = value.trim().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const blocks: string[] = [];
  let bullets: string[] = [];
  const flushBullets = () => {
    if (bullets.length) blocks.push(`<ul>${bullets.join("")}</ul>`);
    bullets = [];
  };
  for (const line of escaped.split(/\r?\n/)) {
    const bullet = line.trim().match(/^[•*-]\s+(.+)$/);
    if (bullet) {
      bullets.push(`<li>${bullet[1]}</li>`);
    } else {
      flushBullets();
      if (line.trim()) blocks.push(`<p>${line.trim()}</p>`);
    }
  }
  flushBullets();
  return blocks.join("\n");
}

function hasVisibleDescriptionText(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return false;
  const text = trimmed
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#160;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return Boolean(text);
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
