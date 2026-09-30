import { createSupabaseServerClient } from "@/lib/supabase/server";
export async function GET(_request: Request, { params }: { params: Promise<{ questionnaireId: string }> }) {
  const supabase = await createSupabaseServerClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return Response.json({ error: "Not authenticated." }, { status: 401 });
  const { questionnaireId } = await params;
  const { data, error } = await supabase.from("questionnaires").select("id,name,status,created_at,updated_at").eq("id", questionnaireId).maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: "Questionnaire not found" }, { status: 404 });
  return Response.json({ ...data, source: "supabase" });
}
