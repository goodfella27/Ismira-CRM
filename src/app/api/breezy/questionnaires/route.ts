import { createSupabaseServerClient } from "@/lib/supabase/server";
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return Response.json({ error: "Not authenticated." }, { status: 401 });
  const { data, error } = await supabase.from("questionnaires").select("id,name,status,created_at,updated_at").order("created_at");
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ questionnaires: data ?? [], source: "supabase" });
}
