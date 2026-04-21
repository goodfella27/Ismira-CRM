import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const BUCKET = "candidate-documents";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

export type JobsHeroLogoRow = {
  id: string;
  company_id: string;
  label: string | null;
  logo_path: string | null;
  sort_order: number | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export async function signJobsHeroLogoUrls<T extends { logo_path?: string | null }>(
  admin: AdminClient,
  rows: T[]
) {
  const signedByPath = new Map<string, string | null>();
  const paths = Array.from(
    new Set(
      rows
        .map((row) => (typeof row.logo_path === "string" ? row.logo_path.trim() : ""))
        .filter(Boolean)
    )
  );

  await Promise.all(
    paths.map(async (path) => {
      const { data, error } = await admin.storage
        .from(BUCKET)
        .createSignedUrl(path, 60 * 60 * 24 * 7);
      signedByPath.set(path, error ? null : data?.signedUrl ?? null);
    })
  );

  return signedByPath;
}

