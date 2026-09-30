"use client";

import Link from "next/link";
import { useWorkspaceRequests } from "@/components/workspace-data-provider";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import { loadBreezyCompanyId, loadBreezyPositionId, saveBreezyCompanyId, saveBreezyPositionId } from "@/lib/breezy-storage";

type Position = { id: string; name: string };
type Candidate = { id: string; name: string; email: string; attachmentCount: number; noteCount: number };

export default function ImportedCandidatesPage() {
  const { request, clear } = useWorkspaceRequests();
  const candidateRequest = useRef<AbortController | null>(null);
  const [companies, setCompanies] = useState<Position[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [positionId, setPositionId] = useState("");
  const [positions, setPositions] = useState<Position[]>([]);
  const [email, setEmail] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await request("/api/breezy/companies", { signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Failed to load companies");
        if (controller.signal.aborted) return;
        const rows: Position[] = data.companies ?? [];
        setCompanies(rows);
        const stored = loadBreezyCompanyId();
        const selected = rows.some(row => row.id === stored) ? stored : rows[0]?.id ?? "";
        setCompanyId(selected);
        if (selected) saveBreezyCompanyId(selected);
      } catch (err) { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Failed to load companies"); }
    })();
    return () => { controller.abort(); candidateRequest.current?.abort(); };
  }, [request]);

  useEffect(() => {
    if (!companyId.trim()) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const res = await request(`/api/breezy/positions?companyId=${encodeURIComponent(companyId.trim())}`, { signal: controller.signal });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load openings");
        if (controller.signal.aborted) return;
        const rows: Position[] = data.positions ?? [];
        setPositions(rows);
        const stored = loadBreezyPositionId();
        const selected = rows.some(row => row.id === stored) ? stored : rows[0]?.id ?? "";
        setPositionId(selected);
        if (selected) saveBreezyPositionId(selected);
      } catch (err) {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Failed to load openings");
      }
    })();
    return () => controller.abort();
  }, [companyId, request]);

  const load = useCallback(async (query = "") => {
    candidateRequest.current?.abort();
    if (!companyId.trim() || !positionId) { setCandidates([]); setLoading(false); return; }
    const controller = new AbortController();
    candidateRequest.current = controller;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ companyId: companyId.trim(), positionId, limit: "100" });
      if (query.trim()) params.set("q", query.trim());
      const endpoint = query.trim() ? "candidate-search" : "imported-candidates";
      const res = await request(`/api/breezy/${endpoint}?${params}`, { signal: controller.signal });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load imported candidates");
      if (!controller.signal.aborted) setCandidates(data.candidates ?? []);
    } catch (err) {
      if (controller.signal.aborted) return;
      setCandidates([]);
      setError(err instanceof Error ? err.message : "Failed to load imported candidates");
    } finally { if (!controller.signal.aborted) setLoading(false); }
  }, [companyId, positionId, request]);

  useEffect(() => { void load(); }, [load]);

  return <main className="mx-auto max-w-6xl space-y-6 p-6">
    <div>
      <h1 className="text-2xl font-semibold">Imported candidates</h1>
      <p className="mt-2 text-muted-foreground">Browse candidates and document counts stored in Supabase. The Breezy integration has been retired; remote imports and synchronization are unavailable.</p>
    </div>
    <div className="grid gap-4 rounded-xl border p-4 md:grid-cols-2">
      <label className="space-y-2 text-sm">Company
        <NativeSelect value={companyId} onChange={(event) => { candidateRequest.current?.abort(); setCandidates([]); setPositionId(""); setPositions([]); setCompanyId(event.target.value); saveBreezyCompanyId(event.target.value); }}>
          {companies.length === 0 ? <option value="">No stored companies</option> : companies.map(company => <option key={company.id} value={company.id}>{company.name}</option>)}
        </NativeSelect>
      </label>
      <label className="space-y-2 text-sm">Opening
        <NativeSelect value={positionId} onChange={(event) => { candidateRequest.current?.abort(); setCandidates([]); setPositionId(event.target.value); saveBreezyPositionId(event.target.value); }}>
          <option value="">Select an opening</option>
          {positions.map(position => <option key={position.id} value={position.id}>{position.name}</option>)}
        </NativeSelect>
      </label>
    </div>
    <form className="flex flex-wrap gap-3" onSubmit={(event) => { event.preventDefault(); void load(email); }}>
      <Input className="max-w-md" aria-label="Candidate email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Search stored candidates by email" />
      <Button type="submit" disabled={loading || !companyId.trim() || !positionId}>Search</Button>
      <Button type="button" variant="secondary" disabled={loading || !positionId} onClick={() => { clear(); setEmail(""); void load(); }}>Refresh list</Button>
    </form>
    {error ? <p role="alert" className="text-destructive">{error}</p> : null}
    {loading ? <p role="status">Loading stored candidates…</p> : candidates.length ? <div className="overflow-x-auto rounded-xl border"><table className="w-full text-left text-sm">
      <thead><tr className="border-b"><th className="p-3">Candidate</th><th className="p-3">Email</th><th className="p-3">Documents</th><th className="p-3">Notes</th></tr></thead>
      <tbody>{candidates.map(candidate => <tr key={candidate.id} className="border-b last:border-0"><td className="p-3">{candidate.name}</td><td className="p-3">{candidate.email || "—"}</td><td className="p-3">{candidate.attachmentCount}</td><td className="p-3">{candidate.noteCount}</td></tr>)}</tbody>
    </table></div> : <p className="text-muted-foreground">{positionId ? "No stored candidates found for this selection." : "Select an opening to view imported candidates."}</p>}
    <Link className="text-primary underline" href="/pipeline">Open CRM pipeline to manage candidates and documents</Link>
  </main>;
}
