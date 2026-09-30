"use client";

import { Input as UiInput } from "@/components/ui/input";
import { Textarea as UiTextarea } from "@/components/ui/textarea";
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
    <div className="min-h-screen bg-muted px-6 py-10">
      <div className="mx-auto flex w-full max-w-3xl flex-col items-center">
        <div className="w-full rounded-dialog bg-card/90 p-8 shadow-overlay ring-1 ring-success/25 backdrop-blur">
          {loading ? (
            <div className="text-center text-sm text-muted-foreground">
              Loading form…
            </div>
          ) : error ? (
            <div className="text-center text-sm text-destructive">{error}</div>
          ) : success ? (
            <div className="text-center">
              <div className="text-xl font-semibold text-foreground">
                Thank you!
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Your information has been submitted successfully.
              </p>
            </div>
          ) : (
            <div>
              <div className="text-center">
                <div className="text-xs uppercase tracking-[0.2em] text-success">
                  ISMIRA CRM
                </div>
                <h1 className="mt-3 text-3xl font-semibold text-foreground">
                  Complete your profile
                </h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  {form?.candidateName
                    ? `Hi ${form.candidateName}, please fill in the missing details.`
                    : "Please fill in the missing details below."}
                </p>
              </div>

              <form onSubmit={handleSubmit} className="mt-8 space-y-4">
                {fieldList.length === 0 ? (
                  <div className="rounded-panel border border-dashed border-success/25 bg-success-muted px-4 py-6 text-center text-sm text-success">
                    No fields were requested for this form.
                  </div>
                ) : (
                  fieldList.map((field) => (
                    <label
                      key={field.key}
                      className="block rounded-panel border border-border bg-card px-4 py-3 text-sm text-foreground shadow-sm"
                    >
                      <span className="text-xs font-semibold uppercase text-muted-foreground">
                        {field.label}
                      </span>
                      {field.type === "file" ? (
                        <input
                          name={field.key}
                          type="file"
                          className="mt-2 w-full text-sm text-muted-foreground"
                        />
                      ) : field.type === "textarea" ? (
                        <UiTextarea
                          name={field.key}
                          rows={4}
                          placeholder={field.label}
                          className="mt-2 w-full"
                        />
                      ) : (
                        <UiInput
                          name={field.key}
                          type={field.type}
                          placeholder={field.label}
                          className="mt-2 w-full"
                        />
                      )}
                    </label>
                  ))
                )}

                {error ? (
                  <div className="rounded-md border border-destructive/25 bg-danger-muted px-4 py-3 text-sm text-destructive">
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
