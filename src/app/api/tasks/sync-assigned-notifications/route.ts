import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type CandidateTaskRow = {
  id: string;
  title: string;
  candidate_id: string;
  created_at: string | null;
};

export async function POST() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: isMember } = await supabase.rpc("is_company_member");
  if (!isMember) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Server misconfigured." },
      { status: 500 }
    );
  }
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  const { data: tasks, error: taskError } = await admin
    .from("candidate_tasks")
    .select("id,title,candidate_id,created_at")
    .eq("assigned_to", user.id)
    .neq("status", "done")
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(50);

  if (taskError) {
    return NextResponse.json({ error: taskError.message }, { status: 500 });
  }

  const taskRows = (tasks ?? []) as CandidateTaskRow[];
  if (taskRows.length === 0) {
    return NextResponse.json({ ok: true, inserted: 0 });
  }

  const taskIds = taskRows.map((row) => row.id);
  const { data: existing } = await admin
    .from("task_notifications")
    .select("task_id")
    .eq("kind", "assigned")
    .eq("recipient_user_id", user.id)
    .in("task_id", taskIds)
    .limit(200);

  const existingTaskIds = new Set(
    (existing ?? [])
      .map((row) => (row as { task_id?: unknown }).task_id)
      .filter((value): value is string => typeof value === "string" && value)
  );

  const missing = taskRows.filter((row) => !existingTaskIds.has(row.id));
  if (missing.length === 0) {
    return NextResponse.json({ ok: true, inserted: 0 });
  }

  const candidateIds = Array.from(new Set(missing.map((row) => row.candidate_id)));
  const { data: candidates } = await admin
    .from("candidates")
    .select("id,data")
    .in("id", candidateIds);

  const candidateNameById = new Map<string, string>();
  (candidates ?? []).forEach((row) => {
    const candidateId = (row as { id?: unknown }).id;
    const data = (row as { data?: unknown }).data;
    if (typeof candidateId !== "string") return;
    if (!data || typeof data !== "object") return;
    const name = (data as { name?: unknown }).name;
    if (typeof name === "string" && name.trim()) {
      candidateNameById.set(candidateId, name.trim());
    }
  });

  const payload = missing.map((row) => ({
    kind: "assigned",
    recipient_user_id: user.id,
    candidate_id: row.candidate_id,
    task_id: row.id,
    task_title: row.title,
    candidate_name: candidateNameById.get(row.candidate_id) ?? null,
    actor_user_id: null,
    actor_name: "System",
    actor_email: null,
    created_at: new Date().toISOString(),
  }));

  const { error: insertError } = await admin.from("task_notifications").insert(payload);
  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, inserted: payload.length });
}
