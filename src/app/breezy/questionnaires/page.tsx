"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useWorkspaceRequests } from "@/components/workspace-data-provider";
import { Button } from "@/components/ui/button";

type RecordItem = { id: string; name: string; status?: string };
export default function Page() {
  const { request, clear } = useWorkspaceRequests();
  const [reload, setReload] = useState(0);
  const [rows, setRows] = useState<RecordItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Record<string, unknown> | null>(null);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const response = await request("/api/breezy/questionnaires");
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Failed to load records");
        if (active) setRows(data.questionnaires ?? []);
      } catch (err) { if (active) setError(err instanceof Error ? err.message : "Failed to load records"); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [request, reload]);
  const showDetails = async (id: string) => {
    setError(null);
    try {
      const response = await request(`/api/breezy/questionnaires/${encodeURIComponent(id)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Failed to load details");
      setSelected(data);
    } catch (err) { setError(err instanceof Error ? err.message : "Failed to load details"); }
  };
  return <main className="mx-auto max-w-5xl space-y-5 p-6">
    <h1 className="text-2xl font-semibold">Questionnaires</h1>
    <p className="text-muted-foreground">Stored questionnaire definitions are managed in company settings.</p>
    <Button variant="secondary" disabled={loading} onClick={() => { clear(); setSelected(null); setReload(value => value + 1); }}>Refresh list</Button>
    {error ? <p role="alert" className="text-destructive">{error}</p> : null}
    {loading ? <p>Loading stored records…</p> : rows.length ? <ul className="divide-y rounded-xl border">{rows.map(row => <li key={row.id} className="flex items-center justify-between gap-3 p-4"><span>{row.name}{row.status ? ` · ${row.status}` : ""}</span><Button variant="secondary" onClick={() => void showDetails(row.id)}>View details</Button></li>)}</ul> : <p>No stored records found.</p>}
    {selected ? <section className="space-y-2 rounded-xl border p-4"><h2 className="font-semibold">Stored details</h2><pre className="overflow-auto text-xs">{JSON.stringify(selected, null, 2)}</pre></section> : null}
    <Link className="text-primary underline" href="/company">Manage questionnaires</Link>
  </main>;
}
