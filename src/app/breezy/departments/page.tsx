"use client";

import { Button as UiButton } from "@/components/ui/button";
import { Input as UiInput } from "@/components/ui/input";
import { NativeSelect as UiSelect } from "@/components/ui/select";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Eye,
  EyeOff,
  GitMerge,
  Loader2,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
} from "lucide-react";

type Department = {
  id: string;
  key: string;
  label: string;
  count: number;
  isHidden: boolean;
  isCustom: boolean;
};

type Draft = {
  label: string;
  isHidden: boolean;
};

function normalizeDepartments(payload: unknown): Department[] {
  if (!payload || typeof payload !== "object") return [];
  const list = (payload as { departments?: unknown }).departments;
  if (!Array.isArray(list)) return [];

  return list
    .map((item) => {
      const row = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
      return {
        id: typeof row.id === "string" ? row.id : "",
        key: typeof row.key === "string" ? row.key : "",
        label: typeof row.label === "string" ? row.label : "",
        count: typeof row.count === "number" && Number.isFinite(row.count) ? row.count : 0,
        isHidden: row.isHidden === true,
        isCustom: row.isCustom === true,
      };
    })
    .filter((item) => item.key && item.label);
}

function toDraft(item: Department): Draft {
  return {
    label: item.label,
    isHidden: item.isHidden,
  };
}

export default function BreezyDepartmentsPage() {
  const [items, setItems] = useState<Department[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [newLabel, setNewLabel] = useState("");
  const [search, setSearch] = useState("");
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [menuOpenKey, setMenuOpenKey] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Department | null>(null);
  const [mergeSource, setMergeSource] = useState<Department | null>(null);
  const [mergeTargetKey, setMergeTargetKey] = useState("");
  const [lastMerge, setLastMerge] = useState<{
    sourceLabel: string;
    targetLabel: string;
    positionsMoved: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const visibleCount = useMemo(() => items.filter((item) => !item.isHidden).length, [items]);
  const hiddenCount = items.length - visibleCount;
  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return items;
    return items.filter((item) =>
      `${item.label} ${item.key} ${item.count}`.toLowerCase().includes(query)
    );
  }, [items, search]);

  const applyDepartments = useCallback((departments: Department[]) => {
    setItems(departments);
    setDrafts(Object.fromEntries(departments.map((item) => [item.key, toDraft(item)])));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/company/job-departments", { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          (data && typeof data?.error === "string" && data.error) ||
            "Failed to load departments."
        );
      }
      applyDepartments(normalizeDepartments(data));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load departments.");
    } finally {
      setLoading(false);
    }
  }, [applyDepartments]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!menuOpenKey) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (!target) return;
      if (target.closest("[data-department-menu]")) return;
      setMenuOpenKey(null);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpenKey(null);
    };

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpenKey]);

  const updateDraft = (key: string, patch: Partial<Draft>) => {
    setDrafts((prev) => ({
      ...prev,
      [key]: {
        ...(prev[key] ?? { label: "", isHidden: false }),
        ...patch,
      },
    }));
  };

  const saveDepartment = async (key: string) => {
    const draft = drafts[key];
    if (!draft) return;
    setSavingKey(key);
      setError(null);
    try {
      const res = await fetch(`/api/company/job-departments/${encodeURIComponent(key)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: draft.label,
          isHidden: draft.isHidden,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          (data && typeof data?.error === "string" && data.error) ||
            "Failed to save department."
        );
      }
      applyDepartments(normalizeDepartments(data));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save department.");
    } finally {
      setSavingKey(null);
    }
  };

  const addDepartment = async () => {
    setSavingKey("new");
    setError(null);
    try {
      const res = await fetch("/api/company/job-departments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: newLabel }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          (data && typeof data?.error === "string" && data.error) ||
            "Failed to add department."
        );
      }
      setNewLabel("");
      setAddModalOpen(false);
      applyDepartments(normalizeDepartments(data));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add department.");
    } finally {
      setSavingKey(null);
    }
  };

  const deleteDepartment = async (item: Department) => {
    setSavingKey(item.key);
    setError(null);
    try {
      const res = await fetch(`/api/company/job-departments/${encodeURIComponent(item.key)}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          (data && typeof data?.error === "string" && data.error) ||
            "Failed to remove department."
        );
      }
      applyDepartments(normalizeDepartments(data));
      setDeleteConfirm(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove department.");
    } finally {
      setSavingKey(null);
    }
  };

  const openMergeModal = (item: Department) => {
    const target = items.find((candidate) => candidate.key !== item.key && !candidate.isHidden);
    setMergeSource(item);
    setMergeTargetKey(target?.key ?? "");
    setMenuOpenKey(null);
    setError(null);
  };

  const mergeDepartment = async () => {
    if (!mergeSource) return;
    const target = items.find((item) => item.key === mergeTargetKey);
    if (!target || target.key === mergeSource.key) {
      setError("Choose a different target department to merge into.");
      return;
    }

    setSavingKey(`merge:${mergeSource.key}`);
    setError(null);
    try {
      const res = await fetch("/api/company/job-departments/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceKey: mergeSource.key,
          targetKey: target.key,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          (data && typeof data?.error === "string" && data.error) ||
            "Failed to merge departments."
        );
      }
      const merge = data && typeof data === "object" ? (data as Record<string, unknown>).merge : null;
      const mergeRecord =
        merge && typeof merge === "object" ? (merge as Record<string, unknown>) : {};
      const positionsMoved = mergeRecord.positionsMoved;
      setLastMerge({
        sourceLabel:
          typeof mergeRecord.sourceLabel === "string" ? mergeRecord.sourceLabel : mergeSource.label,
        targetLabel:
          typeof mergeRecord.targetLabel === "string" ? mergeRecord.targetLabel : target.label,
        positionsMoved:
          typeof positionsMoved === "number" && Number.isFinite(positionsMoved)
            ? positionsMoved
            : mergeSource.count,
      });
      setMergeSource(null);
      setMergeTargetKey("");
      applyDepartments(normalizeDepartments(data));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to merge departments.");
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <div className="mx-auto w-full">
      {mergeSource ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-overlay px-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="merge-department-title"
        >
          <div className="w-full max-w-lg rounded-panel border border-warning/25 bg-card p-6 shadow-2xl">
            <div className="flex h-12 w-12 items-center justify-center rounded-panel bg-warning-muted text-warning ring-1 ring-warning/25">
              <GitMerge className="h-5 w-5" />
            </div>
            <h2
              id="merge-department-title"
              className="mt-4 text-xl font-semibold tracking-tight text-foreground"
            >
              Merge department
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Move {mergeSource.count.toLocaleString()} jobs from {mergeSource.label} into another department.
            </p>
            <label className="mt-5 block">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Merge into
              </span>
              <UiSelect
                className="mt-2 h-12 w-full"
                value={mergeTargetKey}
                onChange={(event) => setMergeTargetKey(event.target.value)}
                disabled={savingKey === `merge:${mergeSource.key}`}
              >
                {items
                  .filter((item) => item.key !== mergeSource.key)
                  .map((item) => (
                    <option key={item.key} value={item.key}>
                      {item.label} ({item.count.toLocaleString()})
                    </option>
                  ))}
              </UiSelect>
            </label>
            <div className="mt-4 rounded-panel border border-warning/25 bg-warning-muted px-4 py-3 text-sm font-semibold leading-6 text-warning">
              Source department will be hidden after merge. Jobs stay in Breezy and only their cached department override changes.
            </div>
            <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
              <UiButton variant="secondary" size="lg"
                type="button"
                className="inline-flex h-11 items-center justify-center transition disabled:opacity-60"
                onClick={() => {
                  setMergeSource(null);
                  setMergeTargetKey("");
                }}
                disabled={savingKey === `merge:${mergeSource.key}`}
              >
                Cancel
              </UiButton>
              <UiButton variant="ghost" size="lg"
                type="button"
                className="inline-flex h-11 items-center justify-center gap-2 transition disabled:opacity-60"
                onClick={() => void mergeDepartment()}
                disabled={savingKey === `merge:${mergeSource.key}` || !mergeTargetKey}
              >
                {savingKey === `merge:${mergeSource.key}` ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <GitMerge className="h-4 w-4" />
                )}
                Merge
              </UiButton>
            </div>
          </div>
        </div>
      ) : null}

      {deleteConfirm ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-overlay px-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-department-title"
        >
          <div className="w-full max-w-md rounded-panel border border-border bg-card p-6 shadow-2xl">
            <div className="flex h-12 w-12 items-center justify-center rounded-panel bg-danger-muted text-destructive ring-1 ring-destructive/25">
              <Trash2 className="h-5 w-5" />
            </div>
            <h2
              id="delete-department-title"
              className="mt-4 text-xl font-semibold tracking-tight text-foreground"
            >
              Remove department?
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {deleteConfirm.count > 0
                ? `${deleteConfirm.label} will be hidden from the public jobs page. Existing jobs stay unchanged.`
                : `${deleteConfirm.label} will be removed from the department list.`}
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
              <UiButton variant="secondary" size="lg"
                type="button"
                className="inline-flex h-11 items-center justify-center transition disabled:opacity-60"
                onClick={() => setDeleteConfirm(null)}
                disabled={savingKey === deleteConfirm.key}
              >
                Cancel
              </UiButton>
              <UiButton variant="destructive" size="lg"
                type="button"
                className="inline-flex h-11 items-center justify-center gap-2 text-destructive-foreground transition disabled:opacity-60"
                onClick={() => void deleteDepartment(deleteConfirm)}
                disabled={savingKey === deleteConfirm.key}
              >
                {savingKey === deleteConfirm.key ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                Remove
              </UiButton>
            </div>
          </div>
        </div>
      ) : null}

      {addModalOpen ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-overlay px-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-department-title"
        >
          <div className="w-full max-w-md rounded-panel border border-border bg-card p-6 shadow-2xl">
            <div className="flex h-12 w-12 items-center justify-center rounded-panel bg-success-muted text-success ring-1 ring-success/25">
              <Plus className="h-5 w-5" />
            </div>
            <h2
              id="add-department-title"
              className="mt-4 text-xl font-semibold tracking-tight text-foreground"
            >
              Add department
            </h2>
            <label className="mt-5 block">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Title
              </span>
              <UiInput
                className="mt-2 h-11 w-full"
                value={newLabel}
                onChange={(event) => setNewLabel(event.target.value)}
                placeholder="Department name"
                autoFocus
                onKeyDown={(event) => {
                  if (event.key === "Enter" && newLabel.trim() && savingKey === null) {
                    event.preventDefault();
                    void addDepartment();
                  }
                }}
              />
            </label>
            <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
              <UiButton variant="secondary" size="lg"
                type="button"
                className="inline-flex h-11 items-center justify-center transition disabled:opacity-60"
                onClick={() => {
                  setAddModalOpen(false);
                  setNewLabel("");
                }}
                disabled={savingKey === "new"}
              >
                Cancel
              </UiButton>
              <UiButton variant="primary" size="lg"
                type="button"
                className="inline-flex h-11 items-center justify-center gap-2 transition disabled:opacity-60"
                onClick={() => void addDepartment()}
                disabled={savingKey !== null || !newLabel.trim()}
              >
                {savingKey === "new" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Save
              </UiButton>
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-panel border border-border bg-card p-5 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Total</div>
          <div className="mt-2 text-3xl font-semibold text-foreground">{items.length}</div>
        </div>
        <div className="rounded-panel border border-border bg-card p-5 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Visible</div>
          <div className="mt-2 text-3xl font-semibold text-success">{visibleCount}</div>
        </div>
        <div className="rounded-panel border border-border bg-card p-5 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Hidden</div>
          <div className="mt-2 text-3xl font-semibold text-foreground">{hiddenCount}</div>
        </div>
      </div>

      {error ? (
        <div className="mt-5 rounded-panel border border-destructive/25 bg-danger-muted px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {lastMerge ? (
        <div className="mt-5 rounded-panel border border-success/25 bg-success-muted px-4 py-3 text-sm font-semibold text-success">
          {lastMerge.sourceLabel} was merged into {lastMerge.targetLabel}.{" "}
          {lastMerge.positionsMoved.toLocaleString()} jobs moved.
        </div>
      ) : null}

      <div className="mt-6 rounded-panel border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-[260px] flex-1 items-center gap-2 rounded-panel border border-border bg-card px-4">
            <Search className="h-4 w-4 text-muted-foreground" />
            <UiInput
              className="h-11 w-full"
              placeholder="Search departments..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <UiButton variant="secondary" size="lg"
            type="button"
            className="inline-flex h-11 items-center justify-center gap-2 transition disabled:opacity-60"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            Refresh
          </UiButton>
          <UiButton variant="primary" size="lg"
            type="button"
            className="inline-flex h-11 items-center justify-center gap-2 transition disabled:opacity-60"
            onClick={() => setAddModalOpen(true)}
            disabled={savingKey !== null}
          >
            <Plus className="h-4 w-4" />
            Add
          </UiButton>
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-panel border border-border bg-card shadow-sm">
        {loading ? (
          <div className="px-4 py-12 text-center text-sm text-muted-foreground">
            Loading departments...
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-muted-foreground">
            No departments found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full table-auto">
              <thead className="bg-muted">
                <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="px-4 py-3">
                    Department
                  </th>
                  <th scope="col" className="w-24 px-4 py-3">
                    Jobs
                  </th>
                  <th scope="col" className="w-32 px-4 py-3">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredItems.map((item) => {
                  const draft = drafts[item.key] ?? toDraft(item);
                  const busy = savingKey === item.key;
                  return (
                    <tr
                      key={item.key}
                      className={[
                        "transition hover:bg-muted",
                        draft.isHidden ? "bg-muted/70 text-muted-foreground" : "bg-card text-foreground",
                      ].join(" ")}
                    >
                      <td className="min-w-[320px] px-4 py-3">
                        <UiInput
                          className="h-10 w-full transition"
                          value={draft.label}
                          onChange={(event) => updateDraft(item.key, { label: event.target.value })}
                          aria-label="Department name"
                        />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm font-semibold text-muted-foreground">
                        {item.count.toLocaleString()}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <span
                          className={[
                            "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold",
                            draft.isHidden
                              ? "bg-muted text-muted-foreground"
                              : "bg-success-muted text-success ring-1 ring-success/25",
                          ].join(" ")}
                        >
                          <span
                            className={[
                              "h-2 w-2 rounded-full",
                              draft.isHidden ? "bg-muted-foreground" : "bg-emerald-500",
                            ].join(" ")}
                          />
                          {draft.isHidden ? "Hidden" : "Visible"}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <UiButton variant="primary" size="md"
                            type="button"
                            className="inline-flex h-10 items-center justify-center gap-2 transition disabled:opacity-60"
                            onClick={() => void saveDepartment(item.key)}
                            disabled={busy || savingKey !== null || !draft.label.trim()}
                            title="Save"
                            aria-label="Save"
                          >
                            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                            Save
                          </UiButton>
                          <div className="relative" data-department-menu>
                            <UiButton variant="secondary" size="md"
                              type="button"
                              className="inline-flex h-10 w-10 items-center justify-center transition disabled:opacity-60"
                              onClick={() =>
                                setMenuOpenKey((current) => (current === item.key ? null : item.key))
                              }
                              disabled={savingKey !== null}
                              title="More actions"
                              aria-label="More actions"
                              aria-haspopup="menu"
                              aria-expanded={menuOpenKey === item.key}
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </UiButton>

                            {menuOpenKey === item.key ? (
                              <div
                                role="menu"
                                className="absolute right-0 top-full z-30 mt-2 w-44 overflow-hidden rounded-panel border border-border bg-card py-1 shadow-xl"
                              >
                                <button
                                  type="button"
                                  role="menuitem"
                                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-semibold text-foreground hover:bg-muted"
                                  onClick={() => {
                                    updateDraft(item.key, { isHidden: !draft.isHidden });
                                    setMenuOpenKey(null);
                                  }}
                                >
                                  {draft.isHidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                                  {draft.isHidden ? "Show" : "Hide"}
                                </button>
                                <button
                                  type="button"
                                  role="menuitem"
                                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-semibold text-foreground hover:bg-muted"
                                  onClick={() => openMergeModal(item)}
                                  disabled={items.length < 2}
                                >
                                  <GitMerge className="h-4 w-4" />
                                  Merge
                                </button>
                                <button
                                  type="button"
                                  role="menuitem"
                                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-semibold text-destructive hover:bg-danger-muted"
                                  onClick={() => {
                                    setMenuOpenKey(null);
                                    setDeleteConfirm(item);
                                  }}
                                >
                                  <Trash2 className="h-4 w-4" />
                                  Remove
                                </button>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
