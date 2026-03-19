import { NextRequest, NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const getOrCreateCompanyId = async (
  admin: ReturnType<typeof createSupabaseAdminClient>,
  userId: string
) => {
  const { data: memberRow, error: memberError } = await admin
    .from("company_members")
    .select("company_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (memberError) {
    throw new Error(memberError.message ?? "Failed to load membership");
  }

  if (memberRow?.company_id) {
    return memberRow.company_id as string;
  }

  const { data, error } = await admin
    .from("companies")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message ?? "Failed to load company");
  }

  if (data?.id) {
    return data.id as string;
  }

  const { data: created, error: createError } = await admin
    .from("companies")
    .insert({ name: "Default Company" })
    .select("id")
    .single();

  if (createError || !created?.id) {
    throw new Error(createError?.message ?? "Failed to create company");
  }

  return created.id as string;
};

const ensureMembership = async (
  admin: ReturnType<typeof createSupabaseAdminClient>,
  companyId: string,
  userId: string
) => {
  const { data, error } = await admin
    .from("company_members")
    .select("user_id")
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message ?? "Failed to verify membership");
  }

  if (data?.user_id) {
    return;
  }

  const { error: insertError } = await admin.from("company_members").insert({
    company_id: companyId,
    user_id: userId,
    role: "Admin",
  });

  if (insertError) {
    throw new Error(insertError.message ?? "Failed to create membership");
  }
};

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const memberIds = Array.isArray(body?.member_ids)
    ? body.member_ids.filter((value: unknown): value is string => typeof value === "string")
    : [];
  const groupName = typeof body?.name === "string" ? body.name.trim() : "";

  const uniqueMemberIds = Array.from(new Set([user.id, ...memberIds]));

  if (uniqueMemberIds.length < 2) {
    return NextResponse.json({ error: "Pick at least one teammate." }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();

  try {
    const companyId = await getOrCreateCompanyId(admin, user.id);
    await ensureMembership(admin, companyId, user.id);

    const { data: companyMembers, error: companyMembersError } = await admin
      .from("company_members")
      .select("user_id")
      .eq("company_id", companyId)
      .in("user_id", uniqueMemberIds);

    if (companyMembersError) {
      throw new Error(companyMembersError.message ?? "Failed to verify members");
    }

    const allowedIds = new Set(
      (companyMembers ?? [])
        .map((row) => (typeof row.user_id === "string" ? row.user_id : null))
        .filter((value): value is string => Boolean(value))
    );

    const missingMembers = uniqueMemberIds.filter((id) => !allowedIds.has(id));
    if (missingMembers.length > 0) {
      return NextResponse.json(
        { error: "Some selected users are not company members." },
        { status: 400 }
      );
    }

    const isGroup = uniqueMemberIds.length > 2 || groupName.length > 0;
    const { data: thread, error: threadError } = await admin
      .from("chat_threads")
      .insert({
        company_id: companyId,
        name: isGroup ? groupName || "Group chat" : null,
        is_group: isGroup,
        type: isGroup ? "group" : "direct",
        created_by: user.id,
      })
      .select("id")
      .single();

    if (threadError || !thread?.id) {
      throw new Error(threadError?.message ?? "Failed to create thread");
    }

    const { error: membersInsertError } = await admin.from("chat_thread_members").insert(
      uniqueMemberIds.map((memberId) => ({
        thread_id: thread.id,
        user_id: memberId,
      }))
    );

    if (membersInsertError) {
      await admin.from("chat_threads").delete().eq("id", thread.id);
      throw new Error(membersInsertError.message ?? "Failed to add thread members");
    }

    return NextResponse.json({ thread_id: thread.id });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create chat." },
      { status: 500 }
    );
  }
}
