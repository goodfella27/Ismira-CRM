"use client";

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
    <div className="min-h-screen bg-gradient-to-br from-emerald-200 via-teal-200 to-slate-200 px-6 py-10">
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
                CV received
              </div>
              <p className="mt-2 text-sm text-slate-600">
                Your CV has been generated and sent to the team.
              </p>
            </div>
          ) : (
            <div>
              <div className="text-center">
                <div className="text-xs uppercase tracking-[0.2em] text-emerald-600">
                  ISMIRA CRM
                </div>
                <h1 className="mt-3 text-3xl font-semibold text-slate-900">
                  Build your CV
                </h1>
                <p className="mt-2 text-sm text-slate-500">
                  {form?.candidateName
                    ? `Hi ${form.candidateName}, fill in your CV details below.`
                    : "Fill in your CV details below."}
                </p>
              </div>

              <form onSubmit={handleSubmit} className="mt-8 space-y-4">
                <label className="block rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">
                  <span className="text-xs font-semibold uppercase text-slate-500">
                    Profile photo
                  </span>
                  <input
                    name="photo"
                    type="file"
                    accept="image/*"
                    className="mt-2 w-full text-sm text-slate-600"
                  />
                </label>

                <label className="block rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">
                  <span className="text-xs font-semibold uppercase text-slate-500">
                    Full name
                  </span>
                  <input
                    name="full_name"
                    type="text"
                    className="mt-2 w-full rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                    placeholder="Your full name"
                    required
                  />
                </label>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">
                    <span className="text-xs font-semibold uppercase text-slate-500">
                      Email
                    </span>
                    <input
                      name="email"
                      type="email"
                      className="mt-2 w-full rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                      placeholder="Email address"
                    />
                  </label>
                  <label className="block rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">
                    <span className="text-xs font-semibold uppercase text-slate-500">
                      Phone
                    </span>
                    <input
                      name="phone"
                      type="tel"
                      className="mt-2 w-full rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                      placeholder="Phone number"
                    />
                  </label>
                </div>

                <label className="block rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">
                  <span className="text-xs font-semibold uppercase text-slate-500">
                    Professional title
                  </span>
                  <input
                    name="title"
                    type="text"
                    className="mt-2 w-full rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                    placeholder="Graphic Designer"
                  />
                </label>

                <label className="block rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">
                  <span className="text-xs font-semibold uppercase text-slate-500">
                    Location / Address
                  </span>
                  <input
                    name="location"
                    type="text"
                    className="mt-2 w-full rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                    placeholder="City, Country"
                  />
                </label>

                <label className="block rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">
                  <span className="text-xs font-semibold uppercase text-slate-500">
                    Summary
                  </span>
                  <textarea
                    name="summary"
                    rows={4}
                    className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                    placeholder="Short professional summary"
                  />
                </label>

                <label className="block rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">
                  <span className="text-xs font-semibold uppercase text-slate-500">
                    Skills / Expertise
                  </span>
                  <div className="mt-2 space-y-2">
                    {skills.map((entry, index) => (
                      <div key={`skill-${index}`} className="flex items-center gap-2">
                        <input
                          type="text"
                          className="flex-1 rounded-full border border-slate-200 px-3 py-2 text-xs"
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
                        <span className="w-10 text-[11px] text-slate-500">
                          {entry.level}%
                        </span>
                        {skills.length > 1 ? (
                          <button
                            type="button"
                            className="text-xs text-rose-500"
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
                      className="text-xs font-semibold text-emerald-600"
                      onClick={() =>
                        setSkills((prev) => [...prev, { name: "", level: 70 }])
                      }
                    >
                      + Add skill
                    </button>
                  </div>
                </label>

                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm text-slate-700 shadow-sm">
                  <div className="text-xs font-semibold uppercase text-slate-500">
                    Experience
                  </div>
                  <div className="mt-3 space-y-4">
                    {experiences.map((entry, index) => (
                      <div key={`exp-${index}`} className="rounded-xl border border-slate-200 p-3">
                        <div className="grid gap-2 sm:grid-cols-2">
                          <input
                            type="text"
                            className="h-9 rounded-md border border-slate-200 px-3 text-xs"
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
                          <input
                            type="text"
                            className="h-9 rounded-md border border-slate-200 px-3 text-xs"
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
                            className="h-9 rounded-md border border-slate-200 px-3 text-xs"
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
                            className="h-9 rounded-md border border-slate-200 px-3 text-xs"
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
                        <textarea
                          className="mt-2 min-h-[70px] rounded-md border border-slate-200 px-3 py-2 text-xs"
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
                            className="mt-2 text-xs text-rose-500"
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
                      className="text-xs font-semibold text-emerald-600"
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

                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm text-slate-700 shadow-sm">
                  <div className="text-xs font-semibold uppercase text-slate-500">
                    Education
                  </div>
                  <div className="mt-3 space-y-4">
                    {education.map((entry, index) => (
                      <div
                        key={`edu-${index}`}
                        className="rounded-xl border border-slate-200 p-3"
                      >
                        <div className="grid gap-2 sm:grid-cols-2">
                          <input
                            type="text"
                            className="h-9 rounded-md border border-slate-200 px-3 text-xs"
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
                          <input
                            type="text"
                            className="h-9 rounded-md border border-slate-200 px-3 text-xs"
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
                            className="h-9 rounded-md border border-slate-200 px-3 text-xs"
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
                            className="h-9 rounded-md border border-slate-200 px-3 text-xs"
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
                        <textarea
                          className="mt-2 min-h-[70px] rounded-md border border-slate-200 px-3 py-2 text-xs"
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
                            className="mt-2 text-xs text-rose-500"
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
                      className="text-xs font-semibold text-emerald-600"
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
                  <label className="block rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">
                    <span className="text-xs font-semibold uppercase text-slate-500">
                      Languages
                    </span>
                    <div className="mt-2 space-y-2">
                      {languages.map((entry, index) => (
                        <div key={`lang-${index}`} className="flex items-center gap-2">
                          <input
                            type="text"
                            className="flex-1 rounded-full border border-slate-200 px-3 py-2 text-xs"
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
                          <span className="w-10 text-[11px] text-slate-500">
                            {entry.level}%
                          </span>
                          {languages.length > 1 ? (
                            <button
                              type="button"
                              className="text-xs text-rose-500"
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
                        className="text-xs font-semibold text-emerald-600"
                        onClick={() =>
                          setLanguages((prev) => [...prev, { name: "", level: 70 }])
                        }
                      >
                        + Add language
                      </button>
                    </div>
                  </label>
                  <label className="block rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">
                    <span className="text-xs font-semibold uppercase text-slate-500">
                      Certifications
                    </span>
                    <textarea
                      name="certifications"
                      rows={3}
                      className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-2 text-sm text-slate-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                      placeholder="Certificates or licenses"
                    />
                  </label>
                </div>

                {error ? (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
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
