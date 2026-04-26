"use client";

import {
  Suspense,
  useMemo,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Loader2, UploadCloud } from "lucide-react";

const DEPARTMENT_OPTIONS = [
  {
    value: "Hotel",
    label: "Hotel",
    description:
      "Culinary, Bar, Restaurant, Housekeeping, Guest Services, Finance, Entertainment, Sales, Spa & Beauty, Casino, Security, IT, Photographers, Stage Staff",
  },
  {
    value: "Technical",
    label: "Technical",
    description: "Deck, Engine, Maintenance, Repair Teams",
  },
] as const;

const EXPERIENCE_OPTIONS = [
  "Ship or land-based experience (2+ years)",
  "Some experience (under 2 years)",
  "No direct experience",
] as const;

const ENGLISH_LEVEL_OPTIONS = [
  "Basic",
  "Intermediate",
  "Upper-Intermediate",
  "Advanced",
  "Fluent",
] as const;

const COUNTRIES = [
  "Afghanistan","Albania","Algeria","Andorra","Angola","Argentina","Armenia","Australia","Austria","Azerbaijan","Bahamas","Bahrain","Bangladesh","Belarus","Belgium","Belize","Bolivia","Bosnia and Herzegovina","Brazil","Bulgaria","Cambodia","Cameroon","Canada","Chile","China","Colombia","Costa Rica","Croatia","Cyprus","Czech Republic","Denmark","Dominican Republic","Ecuador","Egypt","Estonia","Finland","France","Georgia","Germany","Ghana","Greece","Hungary","Iceland","India","Indonesia","Ireland","Israel","Italy","Jamaica","Japan","Jordan","Kazakhstan","Kenya","Kyrgyzstan","Latvia","Lebanon","Liechtenstein","Lithuania","Luxembourg","Malaysia","Maldives","Malta","Mexico","Moldova","Monaco","Mongolia","Montenegro","Morocco","Nepal","Netherlands","New Zealand","Nigeria","North Macedonia","Norway","Pakistan","Panama","Peru","Philippines","Poland","Portugal","Qatar","Romania","Russia","Saudi Arabia","Serbia","Singapore","Slovakia","Slovenia","South Africa","South Korea","Spain","Sri Lanka","Sweden","Switzerland","Tajikistan","Thailand","Tunisia","Turkey","Turkmenistan","Ukraine","United Arab Emirates","United Kingdom","United States","Uzbekistan","Vietnam",
] as const;

type FormState = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  department: string;
  desiredPosition: string;
  experience: string;
  isAdult: string;
  citizenship: string;
  englishLevel: string;
  consent: boolean;
  cv: File | null;
};

const INITIAL_STATE: FormState = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  department: "",
  desiredPosition: "",
  experience: "",
  isAdult: "",
  citizenship: "",
  englishLevel: "",
  consent: false,
  cv: null,
};

const NAME_PATTERN = /^[A-Za-z][A-Za-z' -]{0,79}$/;
const TEXT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 ,.()&/'+\-]{1,119}$/;
const PHONE_PATTERN = /^[0-9+()\- ]{7,24}$/;
const INPUT_CLASS =
  "w-full rounded-[22px] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-100";

function getClientValidationError(form: FormState) {
  if (!form.firstName || !form.lastName || !form.email || !form.phone) {
    return "Please fill in all required contact fields.";
  }
  if (!NAME_PATTERN.test(form.firstName) || !NAME_PATTERN.test(form.lastName)) {
    return "First name and last name must use English letters only.";
  }
  if (!TEXT_PATTERN.test(form.desiredPosition)) {
    return "Desired position must use English characters only.";
  }
  if (!PHONE_PATTERN.test(form.phone)) {
    return "Please enter a valid phone number.";
  }
  if (
    !form.department ||
    !form.experience ||
    !form.isAdult ||
    !form.citizenship ||
    !form.englishLevel
  ) {
    return "Please complete all required selections.";
  }
  if (form.isAdult !== "Yes") {
    return "You must confirm that you are at least 18 years old.";
  }
  if (!form.cv) {
    return "Please upload your CV.";
  }
  if (!form.consent) {
    return "You must accept the privacy notice before submitting.";
  }
  return null;
}

function JobsFormContent() {
  const searchParams = useSearchParams();
  const [form, setForm] = useState<FormState>(INITIAL_STATE);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const positionId = searchParams.get("positionId")?.trim() ?? "";
  const jobTitle = searchParams.get("jobTitle")?.trim() ?? "";

  const heading = useMemo(
    () => (jobTitle ? `Start your application for ${jobTitle}` : "Start your application"),
    [jobTitle]
  );

  const handleChange =
    (key: Exclude<keyof FormState, "cv" | "consent">) =>
    (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const value = event.currentTarget.value;
      setForm((prev) => ({ ...prev, [key]: value }));
    };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const validationError = getClientValidationError(form);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);
    try {
      const payload = new FormData();
      payload.set("firstName", form.firstName.trim());
      payload.set("lastName", form.lastName.trim());
      payload.set("email", form.email.trim().toLowerCase());
      payload.set("phone", form.phone.trim());
      payload.set("department", form.department);
      payload.set("desiredPosition", form.desiredPosition.trim());
      payload.set("experience", form.experience);
      payload.set("isAdult", form.isAdult);
      payload.set("citizenship", form.citizenship);
      payload.set("englishLevel", form.englishLevel);
      payload.set("consent", form.consent ? "yes" : "no");
      if (positionId) payload.set("positionId", positionId);
      if (form.cv) payload.set("cv", form.cv, form.cv.name);

      const res = await fetch("/api/jobs/form/submit", {
        method: "POST",
        body: payload,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error ?? "Unable to submit the application.");
      }

      setSuccess(true);
      setForm(INITIAL_STATE);
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "Unable to submit the application."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.22),_transparent_32%),linear-gradient(135deg,#d7f0f1_0%,#fff7ec_45%,#ffb347_100%)] px-4 py-10 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-5xl">
        <div className="overflow-hidden rounded-[36px] border border-white/70 bg-white/95 shadow-[0_30px_80px_-45px_rgba(15,23,42,0.35)] backdrop-blur">
          <div className="border-b border-slate-200 px-6 py-8 sm:px-10">
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-600">
              ISMIRA Jobs
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-5xl">
              {heading}
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">
              Fill in the form in English only. After submission, the candidate profile and CV are
              sent directly to Breezy.
            </p>
          </div>

          <div className="px-6 py-8 sm:px-10 sm:py-10">
            {success ? (
              <div className="rounded-[28px] border border-emerald-200 bg-emerald-50 px-6 py-8 text-center">
                <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
                <h2 className="mt-4 text-2xl font-semibold text-slate-900">Application submitted</h2>
                <p className="mt-2 text-sm text-slate-600">
                  The candidate profile was sent to Breezy successfully.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-8">
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="First name" required>
                    <input
                      value={form.firstName}
                      onChange={handleChange("firstName")}
                      className={INPUT_CLASS}
                      placeholder="Enter first name"
                    />
                  </Field>
                  <Field label="Last name" required>
                    <input
                      value={form.lastName}
                      onChange={handleChange("lastName")}
                      className={INPUT_CLASS}
                      placeholder="Enter last name"
                    />
                  </Field>
                  <Field label="Email" required>
                    <input
                      type="email"
                      value={form.email}
                      onChange={handleChange("email")}
                      className={INPUT_CLASS}
                      placeholder="name@example.com"
                    />
                  </Field>
                  <Field label="Mobile phone number" required>
                    <input
                      value={form.phone}
                      onChange={handleChange("phone")}
                      className={INPUT_CLASS}
                      placeholder="+370..."
                    />
                  </Field>
                </div>

                <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
                  <Field label="Department you would like to work at" required>
                    <select value={form.department} onChange={handleChange("department")} className={INPUT_CLASS}>
                      <option value="">Please select</option>
                      {DEPARTMENT_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <div className="mt-3 space-y-1 text-xs leading-5 text-slate-500">
                      {DEPARTMENT_OPTIONS.map((option) => (
                        <p key={option.value}>
                          <span className="font-semibold uppercase text-slate-700">{option.label}</span>{" "}
                          – {option.description}
                        </p>
                      ))}
                    </div>
                  </Field>

                  <Field label="Position or department desired" required>
                    <input
                      value={form.desiredPosition}
                      onChange={handleChange("desiredPosition")}
                      className={INPUT_CLASS}
                      placeholder="Example: Assistant Waiter"
                    />
                  </Field>
                </div>

                <Field label="What experience do you have?" required>
                  <div className="space-y-3">
                    {EXPERIENCE_OPTIONS.map((option) => (
                      <label key={option} className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                        <input
                          type="radio"
                          name="experience"
                          value={option}
                          checked={form.experience === option}
                          onChange={handleChange("experience")}
                          className="mt-1 h-4 w-4 border-slate-300 text-sky-600 focus:ring-sky-400"
                        />
                        <span className="text-sm text-slate-700">{option}</span>
                      </label>
                    ))}
                  </div>
                </Field>

                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  <Field label="Are you at least 18 years old?" required>
                    <select value={form.isAdult} onChange={handleChange("isAdult")} className={INPUT_CLASS}>
                      <option value="">Please select</option>
                      <option value="Yes">Yes</option>
                      <option value="No">No</option>
                    </select>
                  </Field>
                  <Field label="Citizenship" required>
                    <select value={form.citizenship} onChange={handleChange("citizenship")} className={INPUT_CLASS}>
                      <option value="">Please select</option>
                      {COUNTRIES.map((country) => (
                        <option key={country} value={country}>
                          {country}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Your English language level" required>
                    <select value={form.englishLevel} onChange={handleChange("englishLevel")} className={INPUT_CLASS}>
                      <option value="">Please select</option>
                      {ENGLISH_LEVEL_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>

                <Field label="Upload your CV in English" required>
                  <label className="flex cursor-pointer items-center gap-4 rounded-[28px] border border-dashed border-slate-300 bg-slate-50 px-5 py-5 transition hover:border-sky-300 hover:bg-sky-50/60">
                    <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-white text-sky-600 shadow-sm">
                      <UploadCloud className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-slate-900">
                        {form.cv ? form.cv.name : "Choose PDF, DOC, or DOCX"}
                      </span>
                      <span className="mt-1 block text-xs text-slate-500">
                        Maximum file size: 8MB
                      </span>
                    </span>
                    <span className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700">
                      Select file
                    </span>
                    <input
                      type="file"
                      accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      className="hidden"
                      onChange={(event) => {
                        const nextFile = event.currentTarget.files?.[0] ?? null;
                        setForm((prev) => ({ ...prev, cv: nextFile }));
                      }}
                    />
                  </label>
                </Field>

                <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-4">
                  <input
                    type="checkbox"
                    checked={form.consent}
                    onChange={(event) => {
                      const nextChecked = event.currentTarget.checked;
                      setForm((prev) => ({ ...prev, consent: nextChecked }));
                    }}
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-400"
                  />
                  <span className="text-sm leading-6 text-slate-700">
                    I consent to the processing of my personal data for this job application.
                  </span>
                </label>

                {error ? (
                  <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {error}
                  </div>
                ) : null}

                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex w-full items-center justify-center rounded-full bg-gradient-to-r from-[#ff9b34] to-[#ffb31a] px-6 py-4 text-base font-semibold text-white shadow-[0_18px_45px_-24px_rgba(251,146,60,0.7)] transition hover:from-[#ff8a1c] hover:to-[#ffa500] disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Submitting…
                    </>
                  ) : (
                    "Submit"
                  )}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function JobsFormFallback() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.22),_transparent_32%),linear-gradient(135deg,#d7f0f1_0%,#fff7ec_45%,#ffb347_100%)] px-4 py-10 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-5xl">
        <div className="rounded-[36px] border border-white/70 bg-white/95 px-6 py-8 text-sm text-slate-500 shadow-[0_30px_80px_-45px_rgba(15,23,42,0.35)] sm:px-10">
          Loading application form…
        </div>
      </div>
    </div>
  );
}

export default function JobsFormPage() {
  return (
    <Suspense fallback={<JobsFormFallback />}>
      <JobsFormContent />
    </Suspense>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-slate-800">
        {label}
        {required ? <span className="text-rose-500"> *</span> : null}
      </span>
      <div className="mt-2">{children}</div>
    </label>
  );
}
