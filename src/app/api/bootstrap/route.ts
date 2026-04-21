import { NextResponse } from "next/server";

import { ensureCompanyMembership } from "@/lib/company/membership";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const DEFAULT_PIPELINES = [
  { id: "mailerlite", name: "MailerLite" },
  { id: "breezy", name: "Breezy" },
  { id: "companies", name: "Companies" },
] as const;

const DEFAULT_STAGES = [
  { id: "consultation", name: "CONSULTATION", order: 0 },
  { id: "uploaded", name: "UPLOADED", order: 1 },
  { id: "ready", name: "READY TO GO", order: 2 },
  { id: "pre-screen", name: "PRE-SCREEN", order: 3 },
  { id: "reminder", name: "REMINDER", order: 4 },
  { id: "tofollowup", name: "TOFOLLOWUP", order: 5 },
  { id: "no-show", name: "NO SHOW PRE...", order: 6 },
  { id: "needs-improve", name: "NEED IMPROVE...", order: 7 },
] as const;

export async function GET() {
  let step = "auth:getUser";
  let user: { id: string } | null = null;
  let userError: Error | null = null;

  try {
    const supabase = await createSupabaseServerClient();
    step = "auth:getUser";
    const result = await supabase.auth.getUser();
    user = result.data.user;
    userError = result.error;
  } catch (error) {
    userError = error instanceof Error ? error : new Error("Failed to verify session.");
  }

  if (userError || !user) {
    return NextResponse.json({ error: userError?.message ?? "Unauthorized" }, { status: 401 });
  }

  try {
    const admin = createSupabaseAdminClient();
    step = "company:ensureMembership";
    const membership = await ensureCompanyMembership(admin, user.id);

    step = "storage:ensureBucket";
    {
      const bucketName = "candidate-documents";
      const { data: buckets, error: bucketsError } = await admin.storage.listBuckets();
      if (bucketsError) {
        throw new Error(bucketsError.message ?? "Failed to list storage buckets");
      }

      const hasBucket =
        (buckets ?? []).some((bucket) => bucket.id === bucketName || bucket.name === bucketName);
      if (!hasBucket) {
        const { error: createBucketError } = await admin.storage.createBucket(bucketName, {
          public: false,
        });
        if (createBucketError && !/already exists/i.test(createBucketError.message ?? "")) {
          throw new Error(createBucketError.message ?? `Failed to create bucket "${bucketName}"`);
        }
      }
    }

    step = "pipelines:select";
    const { data: existingPipelines, error: existingPipelinesError } = await admin
      .from("pipelines")
      .select("id");
    if (existingPipelinesError) {
      throw new Error(existingPipelinesError.message ?? "Failed to load pipelines");
    }

    const pipelineIds = new Set<string>();
    (existingPipelines ?? []).forEach((row) => {
      const id = (row as { id?: unknown }).id;
      if (typeof id === "string" && id) pipelineIds.add(id);
    });

    const missingPipelines = DEFAULT_PIPELINES.filter((pipeline) => !pipelineIds.has(pipeline.id));
    if (missingPipelines.length > 0) {
      step = "pipelines:insert";
      const { error: pipelineInsertError } = await admin
        .from("pipelines")
        .insert(missingPipelines);
      if (pipelineInsertError) {
        throw new Error(pipelineInsertError.message ?? "Failed to seed pipelines");
      }
      missingPipelines.forEach((pipeline) => pipelineIds.add(pipeline.id));
    }

    step = "stages:select";
    const { data: existingStages, error: existingStagesError } = await admin
      .from("pipeline_stages")
      .select("pipeline_id,id");
    if (existingStagesError) {
      throw new Error(existingStagesError.message ?? "Failed to load pipeline stages");
    }

    const stageKey = (pipelineId: string, stageId: string) => `${pipelineId}:${stageId}`;
    const stageKeys = new Set<string>();
    (existingStages ?? []).forEach((row) => {
      const pipelineId = (row as { pipeline_id?: unknown }).pipeline_id;
      const stageId = (row as { id?: unknown }).id;
      if (typeof pipelineId === "string" && typeof stageId === "string") {
        stageKeys.add(stageKey(pipelineId, stageId));
      }
    });

    const stageRows = Array.from(pipelineIds).flatMap((pipelineId) =>
      DEFAULT_STAGES.map((stage) => ({
        pipeline_id: pipelineId,
        id: stage.id,
        name: stage.name,
        order: stage.order,
      }))
    );
    const missingStageRows = stageRows.filter(
      (row) => !stageKeys.has(stageKey(row.pipeline_id, row.id))
    );
    if (missingStageRows.length > 0) {
      step = "stages:insert";
      const { error: stageInsertError } = await admin
        .from("pipeline_stages")
        .insert(missingStageRows);
      if (stageInsertError) {
        throw new Error(stageInsertError.message ?? "Failed to seed pipeline stages");
      }
    }

    return NextResponse.json({ ok: true, membership });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Bootstrap failed",
        step,
      },
      { status: 500 }
    );
  }
}
