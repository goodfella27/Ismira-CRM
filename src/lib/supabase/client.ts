import { createBrowserClient } from "@supabase/ssr";
import { createFetchWithTimeout } from "@/lib/supabase/fetch";

const BROWSER_TIMEOUT_MS = 120_000;
const MISSING_ENV_MESSAGE = "Missing Supabase environment variables.";

type SupabaseBrowserClient = ReturnType<typeof createBrowserClient>;

let cachedBrowserClient: SupabaseBrowserClient | null = null;
let cachedNoopClient: SupabaseBrowserClient | null = null;
let hasWarnedAboutMissingEnv = false;

export function hasSupabaseBrowserEnv() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

function createNoopBrowserClient() {
  const error = { message: MISSING_ENV_MESSAGE };
  const emptyQueryResult = Promise.resolve({ data: [], error });
  const emptySingleResult = Promise.resolve({ data: null, error });

  const queryBuilder = {
    select: () => queryBuilder,
    insert: () => emptySingleResult,
    upsert: () => emptySingleResult,
    update: () => emptySingleResult,
    delete: () => emptySingleResult,
    eq: () => queryBuilder,
    neq: () => queryBuilder,
    gt: () => queryBuilder,
    gte: () => queryBuilder,
    lt: () => queryBuilder,
    lte: () => queryBuilder,
    in: () => queryBuilder,
    or: () => queryBuilder,
    order: () => queryBuilder,
    limit: () => queryBuilder,
    single: () => emptySingleResult,
    maybeSingle: () => emptySingleResult,
    then: emptyQueryResult.then.bind(emptyQueryResult),
    catch: emptyQueryResult.catch.bind(emptyQueryResult),
    finally: emptyQueryResult.finally.bind(emptyQueryResult),
  };

  const channel = {
    on: () => channel,
    subscribe: () => channel,
    unsubscribe: () => Promise.resolve("ok"),
  };

  const noopClient = {
    auth: {
      getUser: async () => ({ data: { user: null }, error }),
      getSession: async () => ({ data: { session: null }, error }),
      signInWithPassword: async () => ({ data: { user: null, session: null }, error }),
      signUp: async () => ({ data: { user: null, session: null }, error }),
      signOut: async () => ({ error: null }),
      updateUser: async () => ({ data: { user: null }, error }),
    },
    from: () => queryBuilder,
    channel: () => channel,
    removeChannel: () => Promise.resolve("ok"),
  };

  return noopClient as unknown as SupabaseBrowserClient;
}

export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!hasSupabaseBrowserEnv() || !url || !anonKey) {
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
