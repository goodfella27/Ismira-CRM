"use client";

import { Input as UiInput } from "@/components/ui/input";
import { Textarea as UiTextarea } from "@/components/ui/textarea";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useParams } from "next/navigation";

type RemoteForm = {
  token: string;
  candidateName?: string | null;
};

type ExperienceEntry = {
  role: string;
  company: string;
  start: string;
  end: string;
  details: string;
};

type EducationEntry = {
  institution: string;
  degree: string;
  start: string;
  end: string;
  details: string;
};

type SkillEntry = {
  name: string;
  level: number;
};

export default function CvBuilderPage() {
  const params = useParams();
  const tokenParam = params?.token;
  const token = Array.isArray(tokenParam) ? tokenParam[0] : tokenParam;

  const [form, setForm] = useState<RemoteForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [experiences, setExperiences] = useState<ExperienceEntry[]>([
    { role: "", company: "", start: "", end: "", details: "" },
  ]);
  const [education, setEducation] = useState<EducationEntry[]>([
    { institution: "", degree: "", start: "", end: "", details: "" },
  ]);
  const [skills, setSkills] = useState<SkillEntry[]>([
    { name: "", level: 70 },
    { name: "", level: 70 },
  ]);
  const [languages, setLanguages] = useState<SkillEntry[]>([
    { name: "", level: 70 },
  ]);

  const experienceJson = useMemo(
    () => JSON.stringify(experiences.filter((entry) => entry.role || entry.company || entry.details)),
    [experiences]
  );
  const educationJson = useMemo(
    () =>
      JSON.stringify(
        education.filter((entry) => entry.institution || entry.degree || entry.details)
      ),
    [education]
  );
  const skillsJson = useMemo(
    () => JSON.stringify(skills.filter((entry) => entry.name)),
    [skills]
  );
  const languagesJson = useMemo(
    () => JSON.stringify(languages.filter((entry) => entry.name)),
    [languages]
  );

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!token) return;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/cv/${token}`, { cache: "no-store" });
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

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token) return;
    setSubmitting(true);
    setError(null);
    try {
      const formData = new FormData(event.currentTarget);
      const res = await fetch(`/api/cv/${token}/submit`, {
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
                CV received
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Your CV has been generated and sent to the team.
              </p>
            </div>
          ) : (
            <div>
              <div className="text-center">
                <div className="text-xs uppercase tracking-[0.2em] text-success">
                  ISMIRA CRM
                </div>
                <h1 className="mt-3 text-3xl font-semibold text-foreground">
                  Build your CV
                </h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  {form?.candidateName
                    ? `Hi ${form.candidateName}, fill in your CV details below.`
                    : "Fill in your CV details below."}
                </p>
              </div>

              <form onSubmit={handleSubmit} className="mt-8 space-y-4">
                <label className="block rounded-panel border border-border bg-card px-4 py-3 text-sm text-foreground shadow-sm">
                  <span className="text-xs font-semibold uppercase text-muted-foreground">
                    Profile photo
                  </span>
                  <input
                    name="photo"
                    type="file"
                    accept="image/*"
                    className="mt-2 w-full text-sm text-muted-foreground"
                  />
                </label>

                <label className="block rounded-panel border border-border bg-card px-4 py-3 text-sm text-foreground shadow-sm">
                  <span className="text-xs font-semibold uppercase text-muted-foreground">
                    Full name
                  </span>
                  <UiInput
                    name="full_name"
                    type="text"
                    className="mt-2 w-full"
                    placeholder="Your full name"
                    required
                  />
                </label>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block rounded-panel border border-border bg-card px-4 py-3 text-sm text-foreground shadow-sm">
                    <span className="text-xs font-semibold uppercase text-muted-foreground">
                      Email
                    </span>
                    <UiInput
                      name="email"
                      type="email"
                      className="mt-2 w-full"
                      placeholder="Email address"
                    />
                  </label>
                  <label className="block rounded-panel border border-border bg-card px-4 py-3 text-sm text-foreground shadow-sm">
                    <span className="text-xs font-semibold uppercase text-muted-foreground">
                      Phone
                    </span>
                    <UiInput
                      name="phone"
                      type="tel"
                      className="mt-2 w-full"
                      placeholder="Phone number"
                    />
                  </label>
                </div>

                <label className="block rounded-panel border border-border bg-card px-4 py-3 text-sm text-foreground shadow-sm">
                  <span className="text-xs font-semibold uppercase text-muted-foreground">
                    Professional title
                  </span>
                  <UiInput
                    name="title"
                    type="text"
                    className="mt-2 w-full"
                    placeholder="Graphic Designer"
                  />
                </label>

                <label className="block rounded-panel border border-border bg-card px-4 py-3 text-sm text-foreground shadow-sm">
                  <span className="text-xs font-semibold uppercase text-muted-foreground">
                    Location / Address
                  </span>
                  <UiInput
                    name="location"
                    type="text"
                    className="mt-2 w-full"
                    placeholder="City, Country"
                  />
                </label>

                <label className="block rounded-panel border border-border bg-card px-4 py-3 text-sm text-foreground shadow-sm">
                  <span className="text-xs font-semibold uppercase text-muted-foreground">
                    Summary
                  </span>
                  <UiTextarea
                    name="summary"
                    rows={4}
                    className="mt-2 w-full"
                    placeholder="Short professional summary"
                  />
                </label>

                <label className="block rounded-panel border border-border bg-card px-4 py-3 text-sm text-foreground shadow-sm">
                  <span className="text-xs font-semibold uppercase text-muted-foreground">
                    Skills / Expertise
                  </span>
                  <div className="mt-2 space-y-2">
                    {skills.map((entry, index) => (
                      <div key={`skill-${index}`} className="flex items-center gap-2">
                        <UiInput
                          type="text"
                          className="flex-1"
                          placeholder="Skill name"
                          value={entry.name}
                          onChange={(event) =>
                            setSkills((prev) =>
                              prev.map((item, idx) =>
                                idx === index
                                  ? { ...item, name: event.target.value }
                                  : item
                              )
                            )
                          }
                        />
                        <input
                          type="range"
                          min={20}
                          max={100}
                          step={5}
                          value={entry.level}
                          onChange={(event) =>
                            setSkills((prev) =>
                              prev.map((item, idx) =>
                                idx === index
                                  ? { ...item, level: Number(event.target.value) }
                                  : item
                              )
                            )
                          }
                        />
                        <span className="w-10 text-[11px] text-muted-foreground">
                          {entry.level}%
                        </span>
                        {skills.length > 1 ? (
                          <button
                            type="button"
                            className="text-xs text-destructive"
                            onClick={() =>
                              setSkills((prev) => prev.filter((_, idx) => idx !== index))
                            }
                          >
                            Remove
                          </button>
                        ) : null}
                      </div>
                    ))}
                    <button
                      type="button"
                      className="text-xs font-semibold text-success"
                      onClick={() =>
                        setSkills((prev) => [...prev, { name: "", level: 70 }])
                      }
                    >
                      + Add skill
                    </button>
                  </div>
                </label>

                <div className="rounded-panel border border-border bg-card px-4 py-4 text-sm text-foreground shadow-sm">
                  <div className="text-xs font-semibold uppercase text-muted-foreground">
                    Experience
                  </div>
                  <div className="mt-3 space-y-4">
                    {experiences.map((entry, index) => (
                      <div key={`exp-${index}`} className="rounded-md border border-border p-3">
                        <div className="grid gap-2 sm:grid-cols-2">
                          <UiInput
                            type="text"
                            className="h-9"
                            placeholder="Role"
                            value={entry.role}
                            onChange={(event) =>
                              setExperiences((prev) =>
                                prev.map((item, idx) =>
                                  idx === index
                                    ? { ...item, role: event.target.value }
                                    : item
                                )
                              )
                            }
                          />
                          <UiInput
                            type="text"
                            className="h-9"
                            placeholder="Company"
                            value={entry.company}
                            onChange={(event) =>
                              setExperiences((prev) =>
                                prev.map((item, idx) =>
                                  idx === index
                                    ? { ...item, company: event.target.value }
                                    : item
                                )
                              )
                            }
                          />
                        </div>
                        <div className="mt-2 grid gap-2 sm:grid-cols-2">
                          <input
                            type="month"
                            className="h-9 rounded-md border border-border px-3 text-xs"
                            value={entry.start}
                            onChange={(event) =>
                              setExperiences((prev) =>
                                prev.map((item, idx) =>
                                  idx === index
                                    ? { ...item, start: event.target.value }
                                    : item
                                )
                              )
                            }
                          />
                          <input
                            type="month"
                            className="h-9 rounded-md border border-border px-3 text-xs"
                            value={entry.end}
                            onChange={(event) =>
                              setExperiences((prev) =>
                                prev.map((item, idx) =>
                                  idx === index
                                    ? { ...item, end: event.target.value }
                                    : item
                                )
                              )
                            }
                          />
                        </div>
                        <UiTextarea
                          className="mt-2 min-h-[70px]"
                          placeholder="Responsibilities / achievements"
                          value={entry.details}
                          onChange={(event) =>
                            setExperiences((prev) =>
                              prev.map((item, idx) =>
                                idx === index
                                  ? { ...item, details: event.target.value }
                                  : item
                              )
                            )
                          }
                        />
                        {experiences.length > 1 ? (
                          <button
                            type="button"
                            className="mt-2 text-xs text-destructive"
                            onClick={() =>
                              setExperiences((prev) =>
                                prev.filter((_, idx) => idx !== index)
                              )
                            }
                          >
                            Remove experience
                          </button>
                        ) : null}
                      </div>
                    ))}
                    <button
                      type="button"
                      className="text-xs font-semibold text-success"
                      onClick={() =>
                        setExperiences((prev) => [
                          ...prev,
                          { role: "", company: "", start: "", end: "", details: "" },
                        ])
                      }
                    >
                      + Add experience
                    </button>
                  </div>
                </div>

                <div className="rounded-panel border border-border bg-card px-4 py-4 text-sm text-foreground shadow-sm">
                  <div className="text-xs font-semibold uppercase text-muted-foreground">
                    Education
                  </div>
                  <div className="mt-3 space-y-4">
                    {education.map((entry, index) => (
                      <div
                        key={`edu-${index}`}
                        className="rounded-md border border-border p-3"
                      >
                        <div className="grid gap-2 sm:grid-cols-2">
                          <UiInput
                            type="text"
                            className="h-9"
                            placeholder="Institution"
                            value={entry.institution}
                            onChange={(event) =>
                              setEducation((prev) =>
                                prev.map((item, idx) =>
                                  idx === index
                                    ? { ...item, institution: event.target.value }
                                    : item
                                )
                              )
                            }
                          />
                          <UiInput
                            type="text"
                            className="h-9"
                            placeholder="Degree"
                            value={entry.degree}
                            onChange={(event) =>
                              setEducation((prev) =>
                                prev.map((item, idx) =>
                                  idx === index
                                    ? { ...item, degree: event.target.value }
                                    : item
                                )
                              )
                            }
                          />
                        </div>
                        <div className="mt-2 grid gap-2 sm:grid-cols-2">
                          <input
                            type="month"
                            className="h-9 rounded-md border border-border px-3 text-xs"
                            value={entry.start}
                            onChange={(event) =>
                              setEducation((prev) =>
                                prev.map((item, idx) =>
                                  idx === index
                                    ? { ...item, start: event.target.value }
                                    : item
                                )
                              )
                            }
                          />
                          <input
                            type="month"
                            className="h-9 rounded-md border border-border px-3 text-xs"
                            value={entry.end}
                            onChange={(event) =>
                              setEducation((prev) =>
                                prev.map((item, idx) =>
                                  idx === index
                                    ? { ...item, end: event.target.value }
                                    : item
                                )
                              )
                            }
                          />
                        </div>
                        <UiTextarea
                          className="mt-2 min-h-[70px]"
                          placeholder="Description"
                          value={entry.details}
                          onChange={(event) =>
                            setEducation((prev) =>
                              prev.map((item, idx) =>
                                idx === index
                                  ? { ...item, details: event.target.value }
                                  : item
                              )
                            )
                          }
                        />
                        {education.length > 1 ? (
                          <button
                            type="button"
                            className="mt-2 text-xs text-destructive"
                            onClick={() =>
                              setEducation((prev) =>
                                prev.filter((_, idx) => idx !== index)
                              )
                            }
                          >
                            Remove education
                          </button>
                        ) : null}
                      </div>
                    ))}
                    <button
                      type="button"
                      className="text-xs font-semibold text-success"
                      onClick={() =>
                        setEducation((prev) => [
                          ...prev,
                          {
                            institution: "",
                            degree: "",
                            start: "",
                            end: "",
                            details: "",
                          },
                        ])
                      }
                    >
                      + Add education
                    </button>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block rounded-panel border border-border bg-card px-4 py-3 text-sm text-foreground shadow-sm">
                    <span className="text-xs font-semibold uppercase text-muted-foreground">
                      Languages
                    </span>
                    <div className="mt-2 space-y-2">
                      {languages.map((entry, index) => (
                        <div key={`lang-${index}`} className="flex items-center gap-2">
                          <UiInput
                            type="text"
                            className="flex-1"
                            placeholder="Language"
                            value={entry.name}
                            onChange={(event) =>
                              setLanguages((prev) =>
                                prev.map((item, idx) =>
                                  idx === index
                                    ? { ...item, name: event.target.value }
                                    : item
                                )
                              )
                            }
                          />
                          <input
                            type="range"
                            min={20}
                            max={100}
                            step={5}
                            value={entry.level}
                            onChange={(event) =>
                              setLanguages((prev) =>
                                prev.map((item, idx) =>
                                  idx === index
                                    ? { ...item, level: Number(event.target.value) }
                                    : item
                                )
                              )
                            }
                          />
                          <span className="w-10 text-[11px] text-muted-foreground">
                            {entry.level}%
                          </span>
                          {languages.length > 1 ? (
                            <button
                              type="button"
                              className="text-xs text-destructive"
                              onClick={() =>
                                setLanguages((prev) =>
                                  prev.filter((_, idx) => idx !== index)
                                )
                              }
                            >
                              Remove
                            </button>
                          ) : null}
                        </div>
                      ))}
                      <button
                        type="button"
                        className="text-xs font-semibold text-success"
                        onClick={() =>
                          setLanguages((prev) => [...prev, { name: "", level: 70 }])
                        }
                      >
                        + Add language
                      </button>
                    </div>
                  </label>
                  <label className="block rounded-panel border border-border bg-card px-4 py-3 text-sm text-foreground shadow-sm">
                    <span className="text-xs font-semibold uppercase text-muted-foreground">
                      Certifications
                    </span>
                    <UiTextarea
                      name="certifications"
                      rows={3}
                      className="mt-2 w-full"
                      placeholder="Certificates or licenses"
                    />
                  </label>
                </div>

                {error ? (
                  <div className="rounded-md border border-destructive/25 bg-danger-muted px-4 py-3 text-sm text-destructive">
                    {error}
                  </div>
                ) : null}

                <input type="hidden" name="experience_json" value={experienceJson} />
                <input type="hidden" name="education_json" value={educationJson} />
                <input type="hidden" name="skills_json" value={skillsJson} />
                <input type="hidden" name="languages_json" value={languagesJson} />

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full rounded-full bg-emerald-500 px-4 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {submitting ? "Submitting..." : "Generate CV"}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
