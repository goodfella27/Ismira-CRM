const toBase64Url = (value: string) =>
  Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

const fromBase64Url = (value: string) => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
  return Buffer.from(padded, "base64").toString("utf8");
};

export const encodeTrackedUrl = (url: string) => toBase64Url(url);
export const decodeTrackedUrl = (encoded: string) => fromBase64Url(encoded);

export const buildOpenPixelUrl = (origin: string, messageId: string, token: string) =>
  `${origin}/api/email/track/open?mid=${encodeURIComponent(messageId)}&t=${encodeURIComponent(
    token
  )}`;

export const buildClickRedirectUrl = (
  origin: string,
  messageId: string,
  token: string,
  targetUrl: string
) =>
  `${origin}/api/email/track/click?mid=${encodeURIComponent(
    messageId
  )}&t=${encodeURIComponent(token)}&u=${encodeURIComponent(encodeTrackedUrl(targetUrl))}`;

export const addOpenPixelToHtml = (
  html: string,
  openPixelUrl: string
) => {
  const pixelTag = `<img src="${openPixelUrl}" width="1" height="1" style="display:none!important" alt="" />`;
  if (/<\/body\s*>/i.test(html)) {
    return html.replace(/<\/body\s*>/i, `${pixelTag}</body>`);
  }
  return `${html}\n${pixelTag}`;
};

export const rewriteLinksForTracking = (
  html: string,
  origin: string,
  messageId: string,
  token: string
) => {
  const hrefRegex = /href=(["'])(https?:\/\/[^"']+)\1/gi;
  return html.replace(hrefRegex, (_match, quote: string, url: string) => {
    // Avoid double-wrapping links if the template is resent.
    if (url.startsWith(`${origin}/api/email/track/click`)) {
      return `href=${quote}${url}${quote}`;
    }
    const redirected = buildClickRedirectUrl(origin, messageId, token, url);
    return `href=${quote}${redirected}${quote}`;
  });
};

