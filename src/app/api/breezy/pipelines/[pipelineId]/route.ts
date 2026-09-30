import { createSupabaseServerClient } from "@/lib/supabase/server";
export async function GET(_request: Request, { params }: { params: Promise<{ pipelineId: string }> }) {
  const supabase = await createSupabaseServerClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return Response.json({ error: "Not authenticated." }, { status: 401 });
  const { pipelineId } = await params;
  const { data, error } = await supabase.from("pipelines").select("id,name").eq("id", pipelineId).maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: "Pipeline not found" }, { status: 404 });
  const { data: stages, error: stageError } = await supabase.from("pipeline_stages").select("id,name,order").eq("pipeline_id", pipelineId).order("order");
  if (stageError) return Response.json({ error: stageError.message }, { status: 500 });
  return Response.json({ ...data, stages: stages ?? [], source: "supabase" });
}
