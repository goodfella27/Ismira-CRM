import { createSupabaseServerClient } from "@/lib/supabase/server";
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return Response.json({ error: "Not authenticated." }, { status: 401 });
  const { data, error } = await supabase.from("pipelines").select("id,name").order("created_at", { ascending: true });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ pipelines: data ?? [], source: "supabase" });
}
