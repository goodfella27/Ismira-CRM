import { createHash } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { buildApplicationDelivery, readApplicationRoutingSettings } from "@/lib/application-mailerlite";
import type { ApplicationValues } from "@/lib/application-form";

const CV_TYPES: Record<string, string> = { pdf: "application/pdf", doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };
export async function saveApplication(values: ApplicationValues, cv: File | null, language: string, positionId: string | null) {
  const admin = createSupabaseAdminClient();
  const bytes = cv ? Buffer.from(await cv.arrayBuffer()) : null;
  // Identical retries keep the same record and CV; edited answers create a new application.
  const fingerprint = createHash("sha256").update(JSON.stringify({ values, language, positionId, cvName: cv?.name ?? null, cvHash: bytes ? createHash("sha256").update(bytes).digest("hex") : null })).digest("hex");
  const id = `${fingerprint.slice(0,8)}-${fingerprint.slice(8,12)}-${fingerprint.slice(12,16)}-${fingerprint.slice(16,20)}-${fingerprint.slice(20,32)}`;
  const settings = await readApplicationRoutingSettings();
  const delivery = buildApplicationDelivery(values, id, settings);
  const extension = cv?.name.split(".").pop()?.toLowerCase();
  const cvPath = cv && extension ? `${id}/cv.${extension}` : null;
  if (cvPath && bytes && extension) {
    const { error } = await admin.storage.from("application-cvs").upload(cvPath, bytes, { contentType: CV_TYPES[extension], upsert: false });
    // A duplicate is the same fingerprinted content from an earlier submission attempt.
    if (error && String(error.statusCode) !== "409" && error.message !== "The resource already exists") throw new Error("Unable to save CV. Please retry.");
  }
  const { data, error } = await admin.rpc("save_application_submission", {
    p_application: {
      id, first_name: values.firstName, last_name: values.lastName, email: values.email,
      phone: values.phone, department: values.department, desired_position: values.desiredPosition,
      experience: values.experience, is_adult: values.isAdult === "Yes", citizenship: values.citizenship,
      english_level: values.englishLevel, language, position_id: positionId,
      cv_path: cvPath, cv_name: cv?.name ?? null, cv_size: cv?.size ?? null,
    },
    p_delivery: delivery,
  });
  if (error || !data) throw new Error("Unable to save application. Please retry.");
  return { applicationId: String(data), deliveryId: delivery?.id ?? null };
}
