import { NextResponse, type NextRequest } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const asString = (value: unknown) => (typeof value === "string" ? value : "");

const clampInt = (value: number, min: number, max: number) =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ companyId: string }> }
) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: member } = await supabase
      .from("company_members")
      .select("company_id, role")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!member) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { companyId } = await context.params;
    const id = asString(companyId).trim();
    if (!id) {
      return NextResponse.json({ error: "Invalid company id" }, { status: 400 });
    }

    const url = new URL(request.url);
    const limitParam = Number.parseInt(url.searchParams.get("limit") ?? "", 10);
    const limit = clampInt(Number.isFinite(limitParam) ? limitParam : 200, 1, 500);

    const admin = createSupabaseAdminClient();

    const { data: companyRow, error: companyError } = await admin
      .from("candidates")
      .select("id,pipeline_id,stage_id,pool_id,status,order,created_at,updated_at,data")
      .eq("id", id)
      .maybeSingle();

    if (companyError) {
      return NextResponse.json(
        { error: companyError.message ?? "Failed to load company" },
        { status: 500 }
      );
    }

    if (!companyRow || companyRow.pipeline_id !== "companies") {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    const [
      notesResult,
      activityResult,
      tasksResult,
      attachmentsResult,
      emailsResult,
      workResult,
      educationResult,
      scorecardResult,
      questionnairesResult,
      linkedCandidatesResult,
    ] = await Promise.all([
      admin
        .from("candidate_notes")
        .select("id,candidate_id,body,created_at,author_name,author_email,author_id")
        .eq("candidate_id", id)
        .order("created_at", { ascending: false })
        .limit(limit),
      admin
        .from("candidate_activity")
        .select("id,candidate_id,type,body,created_at,author_name,author_email,author_id")
        .eq("candidate_id", id)
        .order("created_at", { ascending: false })
        .limit(limit),
      admin.from("candidate_tasks").select("*").eq("candidate_id", id),
      admin
        .from("candidate_attachments")
        .select("candidate_id,id,name,mime,url,path,kind,created_at,created_by")
        .eq("candidate_id", id)
        .order("created_at", { ascending: false })
        .limit(limit),
      admin
        .from("email_messages")
        .select(
          "id,candidate_id,mailbox_id,provider,provider_message_id,provider_thread_id,direction,from_email,from_name,to_emails,cc_emails,bcc_emails,subject,snippet,body_html,body_text,sent_at,received_at,opens_count,clicks_count,raw,created_at"
        )
        .eq("candidate_id", id)
        .order("sent_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(limit),
      admin
        .from("candidate_work_history")
        .select("candidate_id,id,role,company,start,end,details,created_at")
        .eq("candidate_id", id)
        .order("created_at", { ascending: false })
        .limit(limit),
      admin
        .from("candidate_education")
        .select("candidate_id,id,program,institution,start,end,details,created_at")
        .eq("candidate_id", id)
        .order("created_at", { ascending: false })
        .limit(limit),
      admin
        .from("candidate_scorecards")
        .select("candidate_id,thoughts,overall_rating,entries,updated_at")
        .eq("candidate_id", id)
        .maybeSingle(),
      admin
        .from("candidate_questionnaires")
        .select("id,candidate_id,questionnaire_id,name,status,sent_at,sent_by")
        .eq("candidate_id", id)
        .order("sent_at", { ascending: false, nullsFirst: false })
        .limit(limit),
      admin
        .from("candidates")
        .select("id,pipeline_id,stage_id,status,created_at,updated_at,data")
        .neq("pipeline_id", "companies")
        .eq("data->>assigned_company_id", id)
        .order("created_at", { ascending: false })
        .limit(limit),
    ]);

    if (notesResult.error) throw new Error(notesResult.error.message);
    if (activityResult.error) throw new Error(activityResult.error.message);
    if (tasksResult.error) throw new Error(tasksResult.error.message);
    if (attachmentsResult.error) throw new Error(attachmentsResult.error.message);
    if (emailsResult.error) throw new Error(emailsResult.error.message);
    if (workResult.error) throw new Error(workResult.error.message);
    if (educationResult.error) throw new Error(educationResult.error.message);
    if (questionnairesResult.error) throw new Error(questionnairesResult.error.message);

    // Linked candidates is best-effort; older PostgREST versions can reject JSON path filters.
    const linkedCandidatesError = linkedCandidatesResult.error;

    return NextResponse.json({
      company: companyRow,
      related: {
        notes: notesResult.data ?? [],
        activity: activityResult.data ?? [],
        tasks: tasksResult.data ?? [],
        attachments: attachmentsResult.data ?? [],
        emails: emailsResult.data ?? [],
        work_history: workResult.data ?? [],
        education: educationResult.data ?? [],
        scorecard: scorecardResult.data ?? null,
        questionnaires_sent: questionnairesResult.data ?? [],
      },
      linked_candidates: linkedCandidatesError ? [] : linkedCandidatesResult.data ?? [],
      warnings: linkedCandidatesError
        ? { linked_candidates: linkedCandidatesError.message ?? "Failed to load linked candidates" }
        : null,
      meta: { limit },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load company" },
      { status: 500 }
    );
  }
}
