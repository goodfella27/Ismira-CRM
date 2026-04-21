let bootstrapPromise: Promise<void> | null = null;

export async function ensureCompanyBootstrap(): Promise<void> {
  if (bootstrapPromise) return bootstrapPromise;

  bootstrapPromise = (async () => {
    const res = await fetch("/api/bootstrap", {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    });

    if (res.ok) return;

    const payload = await res.json().catch(() => null as unknown);
    const message =
      payload &&
      typeof payload === "object" &&
      payload !== null &&
      "error" in payload &&
      typeof (payload as { error?: unknown }).error === "string"
        ? String((payload as { error: string }).error)
        : `Bootstrap failed (${res.status})`;
    throw new Error(message);
  })();

  try {
    await bootstrapPromise;
  } catch (error) {
    bootstrapPromise = null;
    throw error;
  }
}

