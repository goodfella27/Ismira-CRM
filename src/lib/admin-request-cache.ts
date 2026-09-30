/** In-memory workspace cache. Owned by a mounted authenticated shell, never browser storage. */
export function createAdminRequestCache(fetcher: typeof fetch = fetch, ttlMs = 30_000) {
  const entries = new Map<string, { expiresAt: number; response: Response }>();
  const pending = new Map<string, Promise<Response>>();
  let generation = 0;
  const clear = () => { generation += 1; entries.clear(); pending.clear(); };
  const consume = (work: Promise<Response>, signal?: AbortSignal | null): Promise<Response> => {
    if (!signal) return work.then(response => response.clone());
    if (signal.aborted) return Promise.reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
    return new Promise((resolve, reject) => {
      const abort = () => reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
      signal.addEventListener('abort', abort, { once: true });
      work.then(response => { if (!signal.aborted) resolve(response.clone()); }, reject)
        .finally(() => signal.removeEventListener('abort', abort));
    });
  };
  const request = async (url: string, init?: RequestInit): Promise<Response> => {
    const method = (init?.method ?? 'GET').toUpperCase();
    if (method !== 'GET') {
      clear();
      try { return await fetcher(url, init); } finally { clear(); }
    }
    // Custom headers/credentials may select another identity or representation.
    if (init?.headers || init?.credentials || init?.cache === 'reload') return fetcher(url, init);
    if (init?.signal?.aborted) throw init.signal.reason ?? new DOMException('Aborted', 'AbortError');
    const cached = entries.get(url);
    if (cached && cached.expiresAt > Date.now()) return cached.response.clone();
    const existing = pending.get(url);
    if (existing) return consume(existing, init?.signal);
    const startedAtGeneration = generation;
    // A single consumer unmounting must not cancel the request shared by other screens.
    const work = fetcher(url, { ...init, signal: undefined }).then(response => {
      if (response.status === 401 || response.status === 403) clear();
      if (response.ok && startedAtGeneration === generation) {
        if (entries.size >= 100) entries.delete(entries.keys().next().value!);
        entries.set(url, { expiresAt: Date.now() + ttlMs, response: response.clone() });
      }
      return response;
    });
    pending.set(url, work);
    void work.finally(() => { if (pending.get(url) === work) pending.delete(url); }).catch(() => undefined);
    return consume(work, init?.signal);
  };
  return { request, clear };
}
