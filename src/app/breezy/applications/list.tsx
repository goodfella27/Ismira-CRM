"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Download, Loader2, RefreshCw } from "lucide-react";
type Application = { id: string; first_name: string; last_name: string; email: string; phone: string; department: string; desired_position: string; experience: string; is_adult: boolean; citizenship: string; english_level: string; language: string; position_id: string | null; consent_at: string; cv_name: string | null; created_at: string };
const button = "inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50";
export default function ApplicationsList() {
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [rows, setRows] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { const response = await fetch(`/api/applications?page=${page}`, { cache: "no-store" }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "Unable to load applications."); setRows(data.applications); setTotal(data.total); }
    catch (error) { setError(error instanceof Error ? error.message : "Unable to load applications."); }
    finally { setLoading(false); }
  }, [page]);
  useEffect(() => { void load(); }, [load]);
  const names = new Intl.DisplayNames(["en"], { type: "region" });
  return <div className="mt-6 space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-2xl font-semibold">Applications</h1><p className="mt-2 text-sm text-slate-500">Complete applications and private CVs stored in your CRM.</p></div><div className="flex flex-wrap gap-2"><Link className={button} href="/breezy/application-routing">Communication routing</Link><button className={button} disabled={loading} onClick={() => void load()}><RefreshCw size={16} />Refresh</button></div></div>
    {error && <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-800">{error}</p>}
    {loading ? <p className="flex items-center gap-2 p-6 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" />Loading applications…</p> : !error && <>
      <p className="text-sm text-slate-500">{total} applications · page {page} of {Math.max(1, Math.ceil(total / 25))}</p>
      {!rows.length ? <div className="rounded-2xl border border-slate-200 p-8 text-center text-slate-500">No applications yet.</div> : rows.map(row => <details key={row.id} className="rounded-2xl border border-slate-200 bg-white p-5"><summary className="cursor-pointer"><span className="font-semibold">{row.first_name} {row.last_name}</span><span className="ml-3 text-sm text-slate-500">{row.email} · {new Date(row.created_at).toLocaleDateString()}</span><p className="mt-2 text-sm text-slate-600">{row.desired_position} · {row.department}</p></summary><dl className="mt-5 grid gap-4 border-t border-slate-100 pt-5 text-sm sm:grid-cols-2">{Object.entries({ Email: row.email, Phone: row.phone, Department: row.department, "Desired position": row.desired_position, Experience: row.experience, "At least 18": row.is_adult ? "Yes" : "No", Citizenship: names.of(row.citizenship) || row.citizenship, "English level": row.english_level, "Form language": row.language, "Position reference": row.position_id || "General application", "Consent recorded": new Date(row.consent_at).toLocaleString() }).map(([label, value]) => <div key={label}><dt className="text-slate-500">{label}</dt><dd className="mt-1 break-words font-medium">{value}</dd></div>)}</dl>{row.cv_name ? <a className={`${button} mt-5`} href={`/api/applications/${row.id}/cv`}><Download size={16} />{row.cv_name}</a> : <p className="mt-5 text-sm text-slate-500">No CV provided.</p>}</details>)}
      <div className="flex justify-between"><button className={button} disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</button><button className={button} disabled={page * 25 >= total} onClick={() => setPage(page + 1)}>Next</button></div>
    </>}
  </div>;
}
