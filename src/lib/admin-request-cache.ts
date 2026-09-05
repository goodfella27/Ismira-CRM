/** Per-mounted-page cache: never persists admin responses to browser storage. */
export function createAdminRequestCache(fetcher: typeof fetch = fetch, ttlMs = 30_000) {
  const entries = new Map<string, { expiresAt: number; response: Response }>();
  const pending = new Map<string, Promise<Response>>();
  let generation = 0;
  const clear = () => {
    generation += 1;
    entries.clear();
    pending.clear();
  };
  const request = async (url: string, init?: RequestInit): Promise<Response> => {
    const method = (init?.method ?? "GET").toUpperCase();
    if (method !== "GET") {
      clear();
      try { return await fetcher(url, init); }
      finally { clear(); }
    }
    // Do not share abortable requests between consumers.
    if (init?.signal) return fetcher(url, init);
    const cached = entries.get(url);
    if (cached && cached.expiresAt > Date.now()) return cached.response.clone();
    const existing = pending.get(url);
    if (existing) return (await existing).clone();
    const startedAtGeneration = generation;
    const work = fetcher(url, init).then((response) => {
      if (response.ok && startedAtGeneration === generation) {
        if (entries.size >= 100) entries.delete(entries.keys().next().value!);
        entries.set(url, { expiresAt: Date.now() + ttlMs, response: response.clone() });
      }
      return response;
    });
    pending.set(url, work);
    try { return (await work).clone(); }
    finally { if (pending.get(url) === work) pending.delete(url); }
  };
  return { request, clear };
}
