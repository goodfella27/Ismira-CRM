import { createBrowserClient } from "@supabase/ssr";
import { createFetchWithTimeout } from "@/lib/supabase/fetch";

const BROWSER_TIMEOUT_MS = 120_000;
const MISSING_ENV_MESSAGE = "Missing Supabase environment variables.";

type SupabaseBrowserClient = ReturnType<typeof createBrowserClient>;

let cachedBrowserClient: SupabaseBrowserClient | null = null;
let cachedNoopClient: SupabaseBrowserClient | null = null;
let hasWarnedAboutMissingEnv = false;

function createNoopBrowserClient() {
  const noopTarget = function supabaseNoop() {};
  const noopProxy = new Proxy(noopTarget, {
    get(_target, prop) {
      if (prop === "then") return undefined;
      return noopProxy;
    },
    apply() {
      return noopProxy;
    },
  });

  return noopProxy as unknown as SupabaseBrowserClient;
}

export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    if (typeof window !== "undefined" && !hasWarnedAboutMissingEnv) {
      hasWarnedAboutMissingEnv = true;
      console.error(MISSING_ENV_MESSAGE);
    }

    if (!cachedNoopClient) {
      cachedNoopClient = createNoopBrowserClient();
    }

    return cachedNoopClient;
  }

  if (!cachedBrowserClient) {
    cachedBrowserClient = createBrowserClient(url, anonKey, {
      global: {
        fetch: createFetchWithTimeout(fetch, BROWSER_TIMEOUT_MS),
      },
    });
  }

  return cachedBrowserClient;
}
