const DEFAULT_TIMEOUT_MS = 12_000;

type FetchLike = typeof fetch;

export function createFetchWithTimeout(
  fetchImpl: FetchLike = fetch,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): FetchLike {
  return async (input, init) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort(new Error("Request timed out"));
    }, timeoutMs);

    const upstreamSignal = init?.signal;
    const handleAbort = () => {
      try {
        controller.abort(upstreamSignal?.reason);
      } catch {
        controller.abort();
      }
    };

    if (upstreamSignal) {
      if (upstreamSignal.aborted) {
        handleAbort();
      } else {
        upstreamSignal.addEventListener("abort", handleAbort, { once: true });
      }
    }

    try {
      return await fetchImpl(input, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
      if (upstreamSignal && !upstreamSignal.aborted) {
        upstreamSignal.removeEventListener("abort", handleAbort);
      }
    }
  };
}

