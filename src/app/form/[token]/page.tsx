"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useParams } from "next/navigation";

import { FORM_FIELD_MAP, type FormFieldDefinition } from "@/lib/form-fields";

type RemoteForm = {
  token: string;
  fields: string[];
  candidateName?: string | null;
};

const buildFieldList = (fields: string[]) =>
  fields
    .map((field) => FORM_FIELD_MAP.get(field as FormFieldDefinition["key"]))
    .filter(Boolean) as FormFieldDefinition[];

export default function CandidateFormPage() {
  const params = useParams();
  const tokenParam = params?.token;
  const token = Array.isArray(tokenParam) ? tokenParam[0] : tokenParam;

  const [form, setForm] = useState<RemoteForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!token) return;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/forms/${token}`, { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(
            data?.error ??
              (res.status === 410
                ? "This form link has expired or already been used."
                : "Unable to load form.")
          );
        }
        if (!cancelled) {
          setForm({
            token: data.token,
            fields: Array.isArray(data.fields) ? data.fields : [],
            candidateName: data.candidateName ?? null,
          });
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unable to load form.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const fieldList = useMemo(
    () => buildFieldList(form?.fields ?? []),
    [form?.fields]
  );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token) return;
    setSubmitting(true);
    setError(null);
    try {
      const formData = new FormData(event.currentTarget);
      const res = await fetch(`/api/forms/${token}/submit`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          data?.error ?? "Unable to submit the form. Please try again."
        );
      }
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-lime-200 via-emerald-200 to-emerald-300 px-6 py-10">
      <div className="mx-auto flex w-full max-w-3xl flex-col items-center">
        <div className="w-full rounded-[28px] bg-white/90 p-8 shadow-[0_30px_70px_-55px_rgba(15,23,42,0.6)] ring-1 ring-emerald-200/70 backdrop-blur">
          {loading ? (
            <div className="text-center text-sm text-slate-500">
              Loading form…
            </div>
          ) : error ? (
            <div className="text-center text-sm text-rose-600">{error}</div>
          ) : success ? (
            <div className="text-center">
              <div className="text-xl font-semibold text-slate-900">
                Thank you!
              </div>
              <p className="mt-2 text-sm text-slate-600">
                Your information has been submitted successfully.
              </p>
            </div>
          ) : (
            <div>
              <div className="text-center">
                <div className="text-xs uppercase tracking-[0.2em] text-emerald-600">
                  ISMIRA CRM
                </div>
                <h1 className="mt-3 text-3xl font-semibold text-slate-900">
                  Complete your profile
                </h1>
                <p className="mt-2 text-sm text-slate-500">
                  {form?.candidateName
                    ? `Hi ${form.candidateName}, please fill in the missing details.`
                    : "Please fill in the missing details below."}
                </p>
              </div>

              <form onSubmit={handleSubmit} className="mt-8 space-y-4">
                {fieldList.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-emerald-200 bg-emerald-50 px-4 py-6 text-center text-sm text-emerald-700">
                    No fields were requested for this form.
                  </div>
                ) : (
                  fieldList.map((field) => (
                    <label
                      key={field.key}
                      className="block rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm"
                    >
                      <span className="text-xs font-semibold uppercase text-slate-500">
                        {field.label}
                      </span>
                      {field.type === "file" ? (
                        <input
                          name={field.key}
                          type="file"
                          className="mt-2 w-full text-sm text-slate-600"
                        />
                      ) : field.type === "textarea" ? (
                        <textarea
                          name={field.key}
                          rows={4}
                          placeholder={field.label}
                          className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                        />
                      ) : (
                        <input
                          name={field.key}
                          type={field.type}
                          placeholder={field.label}
                          className="mt-2 w-full rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                        />
                      )}
                    </label>
                  ))
                )}

                {error ? (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
                    {error}
                  </div>
                ) : null}

                <button
                  type="submit"
                  disabled={submitting || fieldList.length === 0}
                  className="w-full rounded-full bg-emerald-500 px-4 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {submitting ? "Submitting..." : "Submit details"}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
