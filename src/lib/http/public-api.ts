type CorsOptions = {
  allowMethods?: string[];
  allowHeaders?: string[];
  maxAgeSeconds?: number;
  forceWildcardOrigin?: boolean;
};

function parseAllowedOrigins(value: string | undefined | null) {
  if (!value) return [];
  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function resolveCorsOrigin(request: Request) {
  const allowed = parseAllowedOrigins(process.env.JOBS_WIDGET_ALLOWED_ORIGINS);
  if (allowed.length === 0) return "*";

  const origin = request.headers.get("origin") ?? "";
  if (!origin) return allowed[0];
  if (allowed.includes(origin)) return origin;
  return "";
}

export function applyCorsHeaders(
  headers: Headers,
  request: Request,
  options: CorsOptions = {}
) {
  if (options.forceWildcardOrigin) {
    headers.set("Access-Control-Allow-Origin", "*");
    const methods = (options.allowMethods ?? ["GET", "OPTIONS"]).join(", ");
    headers.set("Access-Control-Allow-Methods", methods);
    const allowHeaders = options.allowHeaders ?? ["Content-Type"];
    headers.set("Access-Control-Allow-Headers", allowHeaders.join(", "));
    headers.set(
      "Access-Control-Max-Age",
      String(options.maxAgeSeconds ?? 60 * 60 * 24)
    );
    return;
  }

  const origin = resolveCorsOrigin(request);
  if (!origin) return;

  headers.set("Access-Control-Allow-Origin", origin);
  if (origin !== "*") headers.append("Vary", "Origin");

  const methods = (options.allowMethods ?? ["GET", "OPTIONS"]).join(", ");
  headers.set("Access-Control-Allow-Methods", methods);

  const allowHeaders = options.allowHeaders ?? ["Content-Type"];
  headers.set("Access-Control-Allow-Headers", allowHeaders.join(", "));

  headers.set(
    "Access-Control-Max-Age",
    String(options.maxAgeSeconds ?? 60 * 60 * 24)
  );
}

export function applyPublicCacheControl(headers: Headers, value: string) {
  if (!value.trim()) return;
  headers.set("Cache-Control", value);
}
