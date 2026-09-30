"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, Loader2, RefreshCw, Save } from "lucide-react";
import { COMMUNICATION_BUCKETS, EMPTY_ROUTING_SETTINGS, classifyApplicationCommunication, type CommunicationInput, type RoutingSettings } from "@/lib/application-routing";
import { PDF_PRIMARY_COUNTRIES, PDF_FOLLOWUP_COUNTRIES } from "@/lib/application-country-segments";
import { APPLICATION_EXPERIENCE, APPLICATION_LEVELS } from "@/lib/application-form";
import { applicationCountryCodes } from "@/app/apply/countries";

type Group = { id: string; name: string };
type Delivery = { id: string; email: string; bucket: string; group_id: string; status: string; attempts: number; last_error: string | null; created_at: string };
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
export default function ApplicationRoutingSettings() {
  const [settings, setSettings] = useState<RoutingSettings>(EMPTY_ROUTING_SETTINGS);
  const [groups, setGroups] = useState<Group[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [preview, setPreview] = useState<CommunicationInput>({ citizenship: "LT", isAdult: "Yes", experience: APPLICATION_EXPERIENCE[0], englishLevel: "B2" });
  const countries = useMemo(() => {
    const names = new Intl.DisplayNames(["en"], { type: "region" });
    return applicationCountryCodes.map(code => ({ code, name: names.of(code) || code })).sort((a, b) => a.name.localeCompare(b.name));
  }, []);
  const load = useCallback(async (replaceSettings = true) => {
    setLoading(true); setError(null);
    try {
      const response = await fetch("/api/application-routing", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load application routing.");
      if (replaceSettings) { setSettings(data.settings); setDirty(false); }
      setGroups(data.groups); setDeliveries(data.deliveries); setConnectionError(data.connectionError); setReady(true);
    } catch (error) { setError(error instanceof Error ? error.message : "Unable to load routing."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  function change(next: RoutingSettings) { setSettings(next); setDirty(true); setNotice(null); }
  async function save() {
    setSaving(true); setError(null); setNotice(null);
    try {
      const response = await fetch("/api/application-routing", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(settings) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to save routing.");
      setSettings(data.settings); setDirty(false); setNotice("Communication routing settings saved.");
    } catch (error) { setError(error instanceof Error ? error.message : "Unable to save routing."); }
    finally { setSaving(false); }
  }
  async function retry(id: string) {
    setRetrying(id); setError(null); setNotice(null);
    try {
      const response = await fetch("/api/application-routing/retry", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to retry delivery.");
      setNotice(data.status === "sent" ? "Subscriber synced to MailerLite." : data.status === "skipped" ? "Delivery is already sent or currently being processed." : "Delivery failed. See the updated error below.");
      await load(false);
    } catch (error) { setError(error instanceof Error ? error.message : "Unable to retry delivery."); }
    finally { setRetrying(null); }
  }
  const bucket = classifyApplicationCommunication(preview);
  const selectedGroup = groups.find(group => group.id === settings.groups[bucket]);
  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-xs font-semibold uppercase tracking-widest text-success">Apply form</p><h1 className="mt-2 text-2xl font-semibold text-foreground">Application routing</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Choose the MailerLite group for each communication path. Every applicant completes the same form and is saved in this CRM. These settings do not change access to job opportunities.</p></div>
      <Button variant="secondary" disabled={loading || saving || dirty} onClick={() => void load()}><RefreshCw size={16} className={loading ? "animate-spin" : ""} />Refresh</Button>
    </div>
    {error && <p role="alert" className="rounded-md border border-destructive/20 bg-danger-muted p-4 text-sm text-destructive">{error}</p>}
    {notice && <p role="status" className="flex gap-2 rounded-md border border-success/20 bg-success-muted p-4 text-sm text-success"><CheckCircle2 size={18} />{notice}</p>}
    {connectionError && <p role="alert" className="rounded-md border border-warning/20 bg-warning-muted p-4 text-sm text-warning">{connectionError} Existing mappings are preserved.</p>}
    {loading && !ready ? <div className="flex items-center gap-3 p-8 text-muted-foreground"><Loader2 size={18} className="animate-spin" />Loading settings…</div> : ready && <>
      <section className="rounded-panel border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border p-5 sm:p-6"><div><h2 className="font-semibold">Communication destinations</h2><p className="mt-1 text-sm text-muted-foreground">Rules are evaluated in the order below. The first match chooses one destination.</p></div><label className="flex cursor-pointer items-center gap-3 text-sm font-medium"><Switch checked={settings.enabled} disabled={saving} onCheckedChange={enabled => change({ ...settings, enabled })} />Enable MailerLite routing</label></div>
        <fieldset disabled={saving} className="divide-y divide-border">
          {COMMUNICATION_BUCKETS.map((rule, index) => <div key={rule.key} className="grid gap-4 p-5 sm:p-6 lg:grid-cols-[1fr_320px] lg:items-center"><div className="flex gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">{index + 1}</span><div><label htmlFor={`group-${rule.key}`} className="text-sm font-semibold text-foreground">{rule.label}</label><p className="mt-1 text-sm leading-6 text-muted-foreground">{rule.description}</p></div></div><div><NativeSelect id={`group-${rule.key}`} value={settings.groups[rule.key]} onChange={event => change({ ...settings, groups: { ...settings.groups, [rule.key]: event.target.value } })}><option value="">Choose a MailerLite group</option>{settings.groups[rule.key] && !groups.some(group => group.id === settings.groups[rule.key]) && <option value={settings.groups[rule.key]}>Unavailable group · {settings.groups[rule.key]}</option>}{groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}</NativeSelect>{rule.suggestedGroup && !settings.groups[rule.key] && <p className="mt-2 text-xs text-muted-foreground">Existing setup uses: {rule.suggestedGroup}</p>}</div></div>)}
        </fieldset>
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border p-5 sm:p-6"><p className="max-w-xl text-xs leading-5 text-muted-foreground">{settings.enabled ? "New submissions will use these groups after saving." : "Routing is paused. Applications continue to be saved in this CRM."} Existing memberships and subscription preferences are retained. Previously queued deliveries keep their original destination.</p><Button onClick={() => void save()} disabled={saving || !dirty} >{saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}{saving ? "Saving…" : "Save settings"}</Button></div>
      </section>
      <section className="rounded-panel border border-border p-5 sm:p-6"><h2 className="font-semibold">Preview a communication path</h2><p className="mt-1 text-sm text-muted-foreground">Uses the settings above, including unsaved changes. Does not create a subscriber or send an email.</p><div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="space-y-2 text-sm font-medium"><span>Citizenship</span><NativeSelect value={preview.citizenship} onChange={event => setPreview({ ...preview, citizenship: event.target.value })}>{countries.map(country => <option key={country.code} value={country.code}>{country.name}</option>)}</NativeSelect></label><label className="space-y-2 text-sm font-medium"><span>At least 18 years old?</span><NativeSelect value={preview.isAdult} onChange={event => setPreview({ ...preview, isAdult: event.target.value })}><option>Yes</option><option>No</option></NativeSelect></label><label className="space-y-2 text-sm font-medium"><span>Experience</span><NativeSelect value={preview.experience} onChange={event => setPreview({ ...preview, experience: event.target.value })}>{APPLICATION_EXPERIENCE.map(value => <option key={value}>{value}</option>)}</NativeSelect></label><label className="space-y-2 text-sm font-medium"><span>English level</span><NativeSelect value={preview.englishLevel} onChange={event => setPreview({ ...preview, englishLevel: event.target.value })}>{APPLICATION_LEVELS.map(value => <option key={value}>{value}</option>)}</NativeSelect></label></div><div aria-live="polite" className="mt-5 flex flex-wrap items-center gap-3 rounded-md bg-muted p-4 text-sm"><span>{COMMUNICATION_BUCKETS.find(rule => rule.key === bucket)?.label}</span><ArrowRight size={16} /><strong>{selectedGroup?.name || (settings.groups[bucket] ? "Selected group unavailable" : "No destination selected")}</strong>{!settings.enabled && <span className="text-muted-foreground">(routing paused)</span>}</div></section>
      <section className="rounded-panel border border-border p-5 sm:p-6"><h2 className="font-semibold">Country reference</h2><p className="mt-1 text-sm text-muted-foreground">Source: country_eligibility_ismira.pdf · 50 green-list countries · 196 red-list countries · 3 unlisted. Lists determine communication only.</p><div className="mt-4 grid gap-4 sm:grid-cols-2">{[{ title: "PDF green list", codes: PDF_PRIMARY_COUNTRIES }, { title: "PDF red list", codes: PDF_FOLLOWUP_COUNTRIES }].map(list => <details key={list.title} className="rounded-md border border-border p-4"><summary className="cursor-pointer text-sm font-semibold">{list.title} ({list.codes.length})</summary><p className="mt-3 max-h-64 overflow-y-auto text-sm leading-7 text-muted-foreground">{countries.filter(country => list.codes.includes(country.code)).map(country => country.name).join(" · ")}</p></details>)}</div></section>
      <section className="rounded-panel border border-border p-5 sm:p-6"><h2 className="font-semibold">Pending communication deliveries</h2><p className="mt-1 text-sm text-muted-foreground">Up to 50 oldest pending or failed deliveries. Applications are already saved in this CRM. Retry sends the subscriber to its recorded MailerLite group.</p>{deliveries.length === 0 ? <p className="mt-5 text-sm text-success">No deliveries waiting for retry.</p> : <div className="mt-5 divide-y divide-border">{deliveries.map(delivery => <div key={delivery.id} className="flex flex-wrap items-center justify-between gap-4 py-4"><div className="min-w-0"><p className="break-all text-sm font-medium">{delivery.email}</p><p className="mt-1 text-xs text-muted-foreground">{groups.find(group => group.id === delivery.group_id)?.name || delivery.group_id} · {delivery.status} · {delivery.attempts} attempts</p>{delivery.last_error && <p className="mt-2 text-sm text-destructive">{delivery.last_error}</p>}</div><Button variant="secondary" disabled={!!retrying || !settings.enabled || dirty} onClick={() => void retry(delivery.id)}>{retrying === delivery.id ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}Retry</Button></div>)}</div>}</section>
    </>}
  </div>;
}
