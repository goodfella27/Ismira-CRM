import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const toActorName = (user: { email?: string | null; user_metadata?: Record<string, unknown> }) => {
  const meta = user.user_metadata ?? {};
  const first = typeof meta.first_name === "string" ? meta.first_name : "";
  const last = typeof meta.last_name === "string" ? meta.last_name : "";
  const fullFromParts = `${first} ${last}`.trim();
  const full =
    (typeof meta.full_name === "string" ? meta.full_name : "") ||
    (typeof meta.name === "string" ? meta.name : "") ||
    fullFromParts ||
    (user.email ?? "") ||
    "Someone";
  return full.trim() || "Someone";
};

export async function POST(request: Request) {
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

  const body = (await request.json().catch(() => null)) as
    | {
        candidateId?: string;
        taskId?: string;
        recipientUserId?: string;
      }
    | null;

  const candidateId = body?.candidateId?.trim();
  const taskId = body?.taskId?.trim();
  const recipientUserId = body?.recipientUserId?.trim();

  if (!candidateId || !taskId || !recipientUserId) {
    return NextResponse.json({ error: "Missing fields." }, { status: 400 });
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
  const { data: taskRow, error: taskError } = await admin
    .from("candidate_tasks")
    .select("id,title,assigned_to,candidate_id,kind")
    .eq("candidate_id", candidateId)
    .eq("id", taskId)
    .maybeSingle();

  if (taskError || !taskRow) {
    return NextResponse.json(
      { error: taskError?.message ?? "Task not found." },
      { status: 404 }
    );
  }

  if (typeof taskRow.assigned_to !== "string" || taskRow.assigned_to !== recipientUserId) {
    return NextResponse.json(
      { error: "Task assignee does not match." },
      { status: 400 }
    );
  }

  const since = new Date(Date.now() - 5_000).toISOString();
  const { data: recent } = await admin
    .from("task_notifications")
    .select("id")
    .eq("kind", "assigned")
    .eq("recipient_user_id", recipientUserId)
    .eq("task_id", taskId)
    .eq("actor_user_id", user.id)
    .gte("created_at", since)
    .limit(1);

  if (recent && recent.length > 0) {
    return NextResponse.json({ ok: true, deduped: true });
  }

  let candidateName: string | null = null;
  const { data: candidateRow } = await admin
    .from("candidates")
    .select("id,data")
    .eq("id", candidateId)
    .maybeSingle();

  if (candidateRow && typeof (candidateRow as { data?: unknown }).data === "object") {
    const data = (candidateRow as { data?: Record<string, unknown> }).data;
    if (data && typeof data.name === "string" && data.name.trim()) {
      candidateName = data.name.trim();
    }
  }

  const actorName = toActorName(user);
  const actorEmail = user.email ?? null;

  const { error: insertError } = await admin.from("task_notifications").insert({
    kind: "assigned",
    recipient_user_id: recipientUserId,
    candidate_id: candidateId,
    task_id: taskId,
    task_title: typeof taskRow.title === "string" ? taskRow.title : "Task",
    candidate_name: candidateName,
    actor_user_id: user.id,
    actor_name: actorName,
    actor_email: actorEmail,
    created_at: new Date().toISOString(),
  });

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
