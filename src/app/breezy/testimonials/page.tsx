"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Check,
  ImagePlus,
  Loader2,
  MessageSquareQuote,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  X,
} from "lucide-react";

import { COUNTRY_OPTIONS, getCountryCode, toFlagEmoji } from "@/lib/country";

type JobTestimonialAdminItem = {
  id: string;
  name: string;
  role: string;
  country: string;
  quote: string;
  imageUrl: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string | null;
  updatedAt: string | null;
};

type Draft = {
  name: string;
  role: string;
  country: string;
  quote: string;
  isActive: boolean;
  sortOrder: string;
};

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function toDraft(item: JobTestimonialAdminItem): Draft {
  return {
    name: item.name,
    role: item.role,
    country: getCountryCode(item.country) ?? item.country,
    quote: item.quote,
    isActive: item.isActive,
    sortOrder: String(item.sortOrder ?? 0),
  };
}

function normalizeTestimonials(payload: unknown): JobTestimonialAdminItem[] {
  if (!payload || typeof payload !== "object") return [];
  const list = (payload as { testimonials?: unknown }).testimonials;
  if (!Array.isArray(list)) return [];

  return list
    .map((item) => {
      const row = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
      return {
        id: asString(row.id),
        name: asString(row.name),
        role: asString(row.role),
        country: getCountryCode(asString(row.country)) ?? asString(row.country),
        quote: asString(row.quote),
        imageUrl: asString(row.imageUrl) || null,
        isActive: row.isActive !== false,
        sortOrder: typeof row.sortOrder === "number" && Number.isFinite(row.sortOrder) ? row.sortOrder : 0,
        createdAt: asString(row.createdAt) || null,
        updatedAt: asString(row.updatedAt) || null,
      };
    })
    .filter((item) => item.id);
}

export default function BreezyTestimonialsPage() {
  const [items, setItems] = useState<JobTestimonialAdminItem[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [removeImage, setRemoveImage] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  const activeCount = useMemo(() => items.filter((item) => item.isActive).length, [items]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/company/job-testimonials", { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          (data && typeof data?.error === "string" && data.error) ||
            "Failed to load testimonials."
        );
      }
      const parsed = normalizeTestimonials(data);
      setItems(parsed);
      setDrafts(Object.fromEntries(parsed.map((item) => [item.id, toDraft(item)])));
      setFiles({});
      setRemoveImage({});
    } catch (err) {
      setItems([]);
      setDrafts({});
      setError(err instanceof Error ? err.message : "Failed to load testimonials.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const updateDraft = (id: string, patch: Partial<Draft>) => {
    setDrafts((prev) => ({
      ...prev,
      [id]: {
        ...(prev[id] ?? {
          name: "",
          role: "",
          country: "",
          quote: "",
          isActive: true,
          sortOrder: "0",
        }),
        ...patch,
      },
    }));
  };

  const handleAdd = async () => {
    setSavingId("new");
    setError(null);
    try {
      const res = await fetch("/api/company/job-testimonials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "New testimonial",
          role: "",
          country: "",
          quote: "",
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          (data && typeof data?.error === "string" && data.error) ||
            "Failed to add testimonial."
        );
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add testimonial.");
    } finally {
      setSavingId(null);
    }
  };

  const handleSave = async (id: string) => {
    const draft = drafts[id];
    if (!draft) return;
    setSavingId(id);
    setSavedId(null);
    setError(null);
    try {
      const form = new FormData();
      form.set("name", draft.name);
      form.set("role", draft.role);
      form.set("country", draft.country);
      form.set("quote", draft.quote);
      form.set("isActive", draft.isActive ? "true" : "false");
      form.set("sortOrder", draft.sortOrder);
      const file = files[id];
      if (file) form.set("image", file);
      if (removeImage[id]) form.set("removeImage", "true");

      const res = await fetch(`/api/company/job-testimonials/${encodeURIComponent(id)}`, {
        method: "POST",
        body: form,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          (data && typeof data?.error === "string" && data.error) ||
            "Failed to save testimonial."
        );
      }
      await load();
      setSavedId(id);
      window.setTimeout(() => setSavedId((current) => (current === id ? null : current)), 1600);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save testimonial.");
    } finally {
      setSavingId(null);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Delete testimonial${name ? ` from ${name}` : ""}?`)) return;
    setSavingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/company/job-testimonials/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          (data && typeof data?.error === "string" && data.error) ||
            "Failed to delete testimonial."
        );
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete testimonial.");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="mx-auto w-full">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
            Testimonials
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            Manage candidate testimonials shown on the public jobs page.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            Refresh
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-black disabled:opacity-60"
            onClick={() => void handleAdd()}
            disabled={savingId !== null}
          >
            {savingId === "new" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Add testimonial
          </button>
        </div>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total</div>
          <div className="mt-2 text-3xl font-semibold text-slate-900">{items.length}</div>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Active</div>
          <div className="mt-2 text-3xl font-semibold text-emerald-700">{activeCount}</div>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Placement</div>
          <div className="mt-2 text-sm font-semibold leading-6 text-slate-900">
            Top proof strip + inline jobs list rotation
          </div>
        </div>
      </div>

      {error ? (
        <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <div className="mt-6 grid gap-4">
        {loading ? (
          <div className="rounded-3xl border border-slate-200 bg-white px-4 py-12 text-center text-sm text-slate-500 shadow-sm">
            Loading testimonials...
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-3xl border border-slate-200 bg-white px-6 py-12 text-center shadow-sm">
            <MessageSquareQuote className="mx-auto h-8 w-8 text-slate-300" />
            <div className="mt-3 text-sm font-semibold text-slate-900">No testimonials yet</div>
            <div className="mt-1 text-sm text-slate-500">
              Add the first candidate quote to show social proof on the public jobs page.
            </div>
          </div>
        ) : (
          items.map((item) => {
            const draft = drafts[item.id] ?? toDraft(item);
            const busy = savingId === item.id;
            const file = files[item.id];
            const removing = removeImage[item.id];
            return (
              <div
                key={item.id}
                className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="grid gap-5 xl:grid-cols-[220px_minmax(0,1fr)]">
                  <div>
                    <div className="relative h-44 w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                      {item.imageUrl && !removing ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.imageUrl}
                          alt={draft.name || "Testimonial"}
                          className="h-full w-full object-cover"
                          loading="lazy"
                          decoding="async"
                        />
                      ) : (
                        <div className="grid h-full place-items-center text-slate-400">
                          <ImagePlus className="h-8 w-8" />
                        </div>
                      )}
                    </div>

                    <label className="mt-3 block">
                      <span className="sr-only">Upload photo</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="block w-full text-xs text-slate-600 file:mr-3 file:rounded-full file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white hover:file:bg-black"
                        onChange={(event) => {
                          const next = event.target.files?.[0] ?? null;
                          setFiles((prev) => ({ ...prev, [item.id]: next }));
                          if (next) {
                            setRemoveImage((prev) => ({ ...prev, [item.id]: false }));
                          }
                        }}
                      />
                    </label>
                    {file ? (
                      <div className="mt-2 text-xs font-semibold text-slate-500">
                        Selected: {file.name}
                      </div>
                    ) : null}
                    {item.imageUrl ? (
                      <button
                        type="button"
                        className="mt-2 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        onClick={() =>
                          setRemoveImage((prev) => ({ ...prev, [item.id]: !prev[item.id] }))
                        }
                      >
                        {removing ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                        {removing ? "Image will be removed" : "Remove image"}
                      </button>
                    ) : null}
                  </div>

                  <div className="min-w-0">
                    <div className="grid gap-4 md:grid-cols-2">
                      <label>
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Name
                        </span>
                        <input
                          className="mt-2 h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-emerald-300"
                          value={draft.name}
                          onChange={(event) => updateDraft(item.id, { name: event.target.value })}
                        />
                      </label>
                      <label>
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Country
                        </span>
                        <select
                          className="mt-2 h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-emerald-300"
                          value={draft.country}
                          onChange={(event) => updateDraft(item.id, { country: event.target.value })}
                        >
                          <option value="">Select country</option>
                          {COUNTRY_OPTIONS.map((country) => (
                            <option key={country.code} value={country.code}>
                              {toFlagEmoji(country.code)} {country.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Role
                        </span>
                        <input
                          className="mt-2 h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-emerald-300"
                          value={draft.role}
                          onChange={(event) => updateDraft(item.id, { role: event.target.value })}
                        />
                      </label>
                      <label>
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Sort order
                        </span>
                        <input
                          type="number"
                          className="mt-2 h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-emerald-300"
                          value={draft.sortOrder}
                          onChange={(event) => updateDraft(item.id, { sortOrder: event.target.value })}
                        />
                      </label>
                    </div>

                    <label className="mt-4 block">
                      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Quote
                      </span>
                      <textarea
                        className="mt-2 min-h-28 w-full resize-y rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-900 outline-none focus:border-emerald-300"
                        maxLength={500}
                        value={draft.quote}
                        onChange={(event) => updateDraft(item.id, { quote: event.target.value })}
                      />
                    </label>

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                      <label className="inline-flex items-center gap-3 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-200"
                          checked={draft.isActive}
                          onChange={(event) =>
                            updateDraft(item.id, { isActive: event.target.checked })
                          }
                        />
                        Show on jobs page
                      </label>

                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-700 shadow-sm transition hover:bg-rose-50 disabled:opacity-60"
                          onClick={() => void handleDelete(item.id, draft.name)}
                          disabled={busy || savingId !== null}
                        >
                          <Trash2 className="h-4 w-4" />
                          Delete
                        </button>
                        <button
                          type="button"
                          className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-black disabled:opacity-60"
                          onClick={() => void handleSave(item.id)}
                          disabled={busy || savingId !== null}
                        >
                          {busy ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : savedId === item.id ? (
                            <Check className="h-4 w-4" />
                          ) : (
                            <Save className="h-4 w-4" />
                          )}
                          {savedId === item.id ? "Saved" : "Save"}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
