import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const BUCKET = "candidate-documents";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

export type JobTestimonialRow = {
  id: string;
  company_id: string;
  name: string | null;
  role: string | null;
  country: string | null;
  quote: string | null;
  image_path: string | null;
  is_active: boolean | null;
  sort_order: number | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type JobTestimonialPayload = {
  id: string;
  name: string;
  role: string;
  country: string;
  quote: string;
  imageUrl: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string | null;
  updatedAt: string | null;
};

export const JOB_TESTIMONIALS_SELECT =
  "id,company_id,name,role,country,quote,image_path,is_active,sort_order,created_at,updated_at";

export const normalizeJobTestimonialsError = (raw?: string | null) => {
  const message = typeof raw === "string" ? raw.trim() : "";
  if (!message) return "Failed to load testimonials.";
  if (/schema cache/i.test(message) && /job_testimonials/i.test(message)) {
    return [
      "Testimonials table is not set up yet.",
      "Run `supabase/job_testimonials.sql` in the Supabase SQL editor, then reload the API schema cache (Settings -> API -> Reload schema) or restart the API.",
    ].join(" ");
  }
  if (/could not find the table/i.test(message) && /job_testimonials/i.test(message)) {
    return [
      "Testimonials table is not set up yet.",
      "Run `supabase/job_testimonials.sql` in Supabase first.",
    ].join(" ");
  }
  return message;
};

export async function signJobTestimonialImageUrls<T extends { image_path?: string | null }>(
  admin: AdminClient,
  rows: T[]
) {
  const signedByPath = new Map<string, string | null>();
  const paths = Array.from(
    new Set(
      rows
        .map((row) => (typeof row.image_path === "string" ? row.image_path.trim() : ""))
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

export function mapJobTestimonialRow(
  row: JobTestimonialRow,
  signedUrls: Map<string, string | null>
): JobTestimonialPayload {
  const imagePath =
    typeof row.image_path === "string" && row.image_path.trim() ? row.image_path.trim() : "";

  return {
    id: row.id,
    name: (row.name ?? "").trim(),
    role: (row.role ?? "").trim(),
    country: (row.country ?? "").trim(),
    quote: (row.quote ?? "").trim(),
    imageUrl: imagePath ? signedUrls.get(imagePath) ?? null : null,
    isActive: row.is_active !== false,
    sortOrder: Number.isFinite(row.sort_order) ? Number(row.sort_order) : 0,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export const sanitizeJobTestimonialFilename = (name: string) =>
  name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
