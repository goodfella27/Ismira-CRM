import { createBrowserClient } from "@supabase/ssr";
import { createFetchWithTimeout } from "@/lib/supabase/fetch";

export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("Missing Supabase environment variables.");
  }

  return createBrowserClient(url, anonKey, {
    global: {
      fetch: createFetchWithTimeout(fetch),
    },
  });
}
