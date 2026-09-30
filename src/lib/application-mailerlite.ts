import { createHash } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { mailerliteFetch } from "@/lib/mailerlite";
import { classifyApplicationCommunication, EMPTY_ROUTING_SETTINGS, parseRoutingSettings, type RoutingSettings } from "@/lib/application-routing";
import type { ApplicationValues } from "@/lib/application-form";

export type MailerLiteGroup = { id: string; name: string };
export async function listApplicationMailerLiteGroups(): Promise<MailerLiteGroup[]> {
  const groups: MailerLiteGroup[] = [];
  for (let page = 1; page <= 100; page++) {
    const response = await mailerliteFetch(`/groups?limit=100&page=${page}&sort=name`, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`MailerLite group lookup failed (${response.status}). Check Company → Integrations.`);
    const result = await response.json();
    if (!Array.isArray(result.data)) throw new Error("Invalid MailerLite groups response.");
    for (const group of result.data) {
      if (typeof group.id !== "string" || typeof group.name !== "string") throw new Error("Invalid MailerLite group.");
      groups.push({ id: group.id, name: group.name });
    }
    if (!result.links?.next) return groups;
  }
  throw new Error("Too many MailerLite group pages. Please contact support.");
}
export async function readApplicationRoutingSettings(options: { allowMissingSchema?: boolean } = {}): Promise<RoutingSettings> {
  const { data, error } = await createSupabaseAdminClient().from("application_routing_settings").select("enabled,groups").eq("id", true).maybeSingle();
  if (error) {
    if (options.allowMissingSchema && ["PGRST205", "42P01"].includes(error.code)) return EMPTY_ROUTING_SETTINGS;
    throw new Error("Application routing storage is unavailable. Apply the application_communication_routing migration to this CRM’s Supabase project.");
  }
  return data ? parseRoutingSettings(data) : EMPTY_ROUTING_SETTINGS;
}
export function buildApplicationSubscriber(values: ApplicationValues, groupId: string) {
  return {
    email: values.email.trim().toLowerCase(),
    fields: {
      name: values.firstName.trim(), last_name: values.lastName.trim(), phone: values.phone.trim(),
      country: new Intl.DisplayNames(["en"], { type: "region" }).of(values.citizenship) || values.citizenship,
      are_you_at_least_18_years_old: values.isAdult,
      // Existing MailerLite text field is named “Department you would like to work at”.
      submission_count: values.department,
      position_or_department_desired: values.desiredPosition,
      what_experience_do_you_have: values.experience,
      your_english_language_level: values.englishLevel,
    },
    groups: [groupId],
    // Never override unsubscribe/bounce status. Upsert adds a group without removing others.
    resubscribe: false,
  };
}
export function buildApplicationDelivery(values: ApplicationValues, applicationId: string, settings: RoutingSettings) {
  if (!settings.enabled) return null;
  const bucket = classifyApplicationCommunication(values);
  const groupId = settings.groups[bucket];
  if (!groupId) throw new Error("Communication destination is not configured.");
  const payload = buildApplicationSubscriber(values, groupId);
  const id = createHash("sha256").update(JSON.stringify({ applicationId, bucket, payload })).digest("hex");
  return { id, bucket, group_id: groupId, payload };
}
export async function deliverApplicationCommunication(id: string): Promise<"sent" | "failed" | "skipped"> {
  const admin = createSupabaseAdminClient();
  const now = new Date().toISOString();
  // Atomic lease: admin retries and the submit request cannot process the same row concurrently.
  const { data: row, error } = await admin.from("application_mailerlite_deliveries")
    .update({ status: "processing", locked_until: new Date(Date.now() + 120000).toISOString(), updated_at: now })
    .eq("id", id).or(`status.in.(pending,failed),and(status.eq.processing,locked_until.lt.${now})`)
    .select("payload,attempts").maybeSingle();
  if (error) throw new Error("Unable to claim communication delivery.");
  if (!row) return "skipped";
  let status: "sent" | "failed" = "failed";
  let subscriberId: string | null = null;
  let lastError: string | null = null;
  try {
    const response = await mailerliteFetch("/subscribers", { method: "POST", body: JSON.stringify(row.payload), signal: AbortSignal.timeout(20000) });
    const body = await response.json().catch(() => null);
    if (!response.ok || !body?.data?.id) {
      lastError = `MailerLite delivery failed (HTTP ${response.status}). Check the selected group and integration, then retry.`;
    } else {
      status = "sent"; subscriberId = String(body.data.id);
    }
  } catch { lastError = "MailerLite could not be reached. The application is saved and can be retried."; }
  const { error: updateError } = await admin.from("application_mailerlite_deliveries").update({
    status, subscriber_id: subscriberId, last_error: lastError, attempts: row.attempts + 1,
    locked_until: null, updated_at: new Date().toISOString(),
  }).eq("id", id);
  if (updateError) throw new Error("Delivery result could not be recorded. Retry after the delivery lock expires.");
  return status;
}
