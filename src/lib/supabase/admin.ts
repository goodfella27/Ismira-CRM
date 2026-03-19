import { createClient } from "@supabase/supabase-js";
import { createFetchWithTimeout } from "@/lib/supabase/fetch";

export function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error("Missing Supabase environment variables.");
  }

  return createClient(url, serviceKey, {
    auth: { persistSession: false },
    global: { fetch: createFetchWithTimeout(fetch) },
  });
}
