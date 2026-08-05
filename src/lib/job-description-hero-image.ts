function escapeAttribute(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function composeDescriptionWithHeroImage({
  heroImageUrl,
  bodyHtml,
}: {
  heroImageUrl: string;
  bodyHtml: string;
}) {
  const body = bodyHtml.trim();
  const hero = heroImageUrl.trim();
  if (!hero) return body;

  const image = `<p><img src="${escapeAttribute(hero)}" alt="" /></p>`;
  return body ? `${image}\n${body}` : image;
}
