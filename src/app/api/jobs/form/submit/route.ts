import { NextResponse } from "next/server";
import { verifyApplicationChallenge } from "@/lib/application-challenge";
import { validateApplication, validateApplicationCV, type ApplicationValues } from "@/lib/application-form";
import { applicationCountryCodes } from "@/app/apply/countries";
import { saveApplication } from "@/lib/application-submissions";
import { deliverApplicationCommunication } from "@/lib/application-mailerlite";

export const runtime = "nodejs";
function text(data: FormData, key: string) { const value = data.get(key); return typeof value === "string" ? value.trim() : ""; }
export async function POST(request: Request) {
  try {
    const data = await request.formData();
    if (!verifyApplicationChallenge(text(data, "challengeToken"), text(data, "challengeAnswer"))) {
      return NextResponse.json({ error: "Security check failed.", code: "captcha" }, { status: 400 });
    }
    const countryInput = text(data, "citizenship");
    const names = new Intl.DisplayNames(["en"], { type: "region" });
    const citizenship = applicationCountryCodes.find(code => code === countryInput || names.of(code) === countryInput);
    if (!citizenship) return NextResponse.json({ error: "Invalid citizenship.", errors: { citizenship: "invalid" } }, { status: 400 });
    const values: ApplicationValues = {
      firstName: text(data, "firstName"), lastName: text(data, "lastName"), email: text(data, "email").toLowerCase(),
      phone: text(data, "phone"), department: text(data, "department"), desiredPosition: text(data, "desiredPosition"),
      experience: text(data, "experience"), isAdult: text(data, "isAdult"), citizenship,
      englishLevel: text(data, "englishLevel"), consent: text(data, "consent") === "yes",
    };
    const errors = Object.assign({}, ...[0, 1, 2, 3].map(step => validateApplication(values, step)));
    if (values.email.length > 254) errors.email = "invalid";
    if (Object.keys(errors).length) return NextResponse.json({ error: "Invalid application.", errors }, { status: 400 });
    const entry = data.get("cv");
    const cv = entry instanceof File && entry.name ? entry : null;
    const fileError = validateApplicationCV(cv);
    if (fileError) return NextResponse.json({ error: "Invalid CV.", code: fileError }, { status: 400 });
    const language = text(data, "language") || "en";
    if (!["en", "lt", "pl", "uk", "de", "ru"].includes(language)) return NextResponse.json({ error: "Invalid language." }, { status: 400 });
    const positionId = text(data, "positionId");
    if (positionId.length > 120) return NextResponse.json({ error: "Invalid position." }, { status: 400 });
    const saved = await saveApplication(values, cv, language, positionId || null);
    // Durable delivery was committed with the application, so a MailerLite outage loses no data.
    if (saved.deliveryId) await deliverApplicationCommunication(saved.deliveryId).catch(() => undefined);
    return NextResponse.json({ ok: true, applicationId: saved.applicationId });
  } catch {
    return NextResponse.json({ error: "Unable to save application. Please retry.", code: "submit" }, { status: 503 });
  }
}
