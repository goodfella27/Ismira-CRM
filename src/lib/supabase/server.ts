import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createFetchWithTimeout } from "@/lib/supabase/fetch";

export async function createSupabaseServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("Missing Supabase environment variables.");
  }

  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    global: {
      fetch: createFetchWithTimeout(fetch),
    },
    cookies: {
      getAll() {
        if (typeof cookieStore.getAll === "function") {
          return cookieStore.getAll();
        }
        return [];
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options);
        });
      },
    },
  });
}
