"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, Loader2, RefreshCw, Save } from "lucide-react";
import { COMMUNICATION_BUCKETS, EMPTY_ROUTING_SETTINGS, classifyApplicationCommunication, type CommunicationInput, type RoutingSettings } from "@/lib/application-routing";
import { PDF_PRIMARY_COUNTRIES, PDF_FOLLOWUP_COUNTRIES } from "@/lib/application-country-segments";
import { APPLICATION_EXPERIENCE, APPLICATION_LEVELS } from "@/lib/application-form";
import { applicationCountryCodes } from "@/app/apply/countries";

type Group = { id: string; name: string };
type Delivery = { id: string; email: string; bucket: string; group_id: string; status: string; attempts: number; last_error: string | null; created_at: string };
const control = "w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 disabled:opacity-50";
const button = "inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50";

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
  return <div className="mt-6 space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-xs font-semibold uppercase tracking-widest text-emerald-700">Apply form</p><h1 className="mt-2 text-2xl font-semibold text-slate-900">Application routing</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Choose the MailerLite group for each communication path. Every applicant completes the same form and is saved in this CRM. These settings do not change access to job opportunities.</p></div>
      <button className={button} disabled={loading || saving || dirty} onClick={() => void load()}><RefreshCw size={16} className={loading ? "animate-spin" : ""} />Refresh</button>
    </div>
    {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</p>}
    {notice && <p role="status" className="flex gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"><CheckCircle2 size={18} />{notice}</p>}
    {connectionError && <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{connectionError} Existing mappings are preserved.</p>}
    {loading && !ready ? <div className="flex items-center gap-3 p-8 text-slate-500"><Loader2 size={18} className="animate-spin" />Loading settings…</div> : ready && <>
      <section className="rounded-2xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 p-5 sm:p-6"><div><h2 className="font-semibold">Communication destinations</h2><p className="mt-1 text-sm text-slate-500">Rules are evaluated in the order below. The first match chooses one destination.</p></div><label className="flex cursor-pointer items-center gap-3 text-sm font-medium"><input type="checkbox" checked={settings.enabled} disabled={saving} onChange={event => change({ ...settings, enabled: event.target.checked })} className="h-5 w-5 accent-emerald-600" />Enable MailerLite routing</label></div>
        <fieldset disabled={saving} className="divide-y divide-slate-100">
          {COMMUNICATION_BUCKETS.map((rule, index) => <div key={rule.key} className="grid gap-4 p-5 sm:p-6 lg:grid-cols-[1fr_320px] lg:items-center"><div className="flex gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-500">{index + 1}</span><div><label htmlFor={`group-${rule.key}`} className="text-sm font-semibold text-slate-900">{rule.label}</label><p className="mt-1 text-sm leading-6 text-slate-500">{rule.description}</p></div></div><div><select id={`group-${rule.key}`} className={control} value={settings.groups[rule.key]} onChange={event => change({ ...settings, groups: { ...settings.groups, [rule.key]: event.target.value } })}><option value="">Choose a MailerLite group</option>{settings.groups[rule.key] && !groups.some(group => group.id === settings.groups[rule.key]) && <option value={settings.groups[rule.key]}>Unavailable group · {settings.groups[rule.key]}</option>}{groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}</select>{rule.suggestedGroup && !settings.groups[rule.key] && <p className="mt-2 text-xs text-slate-500">Existing setup uses: {rule.suggestedGroup}</p>}</div></div>)}
        </fieldset>
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 p-5 sm:p-6"><p className="max-w-xl text-xs leading-5 text-slate-500">{settings.enabled ? "New submissions will use these groups after saving." : "Routing is paused. Applications continue to be saved in this CRM."} Existing memberships and subscription preferences are retained. Previously queued deliveries keep their original destination.</p><button onClick={() => void save()} disabled={saving || !dirty} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">{saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}{saving ? "Saving…" : "Save settings"}</button></div>
      </section>
      <section className="rounded-2xl border border-slate-200 p-5 sm:p-6"><h2 className="font-semibold">Preview a communication path</h2><p className="mt-1 text-sm text-slate-500">Uses the settings above, including unsaved changes. Does not create a subscriber or send an email.</p><div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="space-y-2 text-sm font-medium"><span>Citizenship</span><select className={control} value={preview.citizenship} onChange={event => setPreview({ ...preview, citizenship: event.target.value })}>{countries.map(country => <option key={country.code} value={country.code}>{country.name}</option>)}</select></label><label className="space-y-2 text-sm font-medium"><span>At least 18 years old?</span><select className={control} value={preview.isAdult} onChange={event => setPreview({ ...preview, isAdult: event.target.value })}><option>Yes</option><option>No</option></select></label><label className="space-y-2 text-sm font-medium"><span>Experience</span><select className={control} value={preview.experience} onChange={event => setPreview({ ...preview, experience: event.target.value })}>{APPLICATION_EXPERIENCE.map(value => <option key={value}>{value}</option>)}</select></label><label className="space-y-2 text-sm font-medium"><span>English level</span><select className={control} value={preview.englishLevel} onChange={event => setPreview({ ...preview, englishLevel: event.target.value })}>{APPLICATION_LEVELS.map(value => <option key={value}>{value}</option>)}</select></label></div><div aria-live="polite" className="mt-5 flex flex-wrap items-center gap-3 rounded-xl bg-slate-50 p-4 text-sm"><span>{COMMUNICATION_BUCKETS.find(rule => rule.key === bucket)?.label}</span><ArrowRight size={16} /><strong>{selectedGroup?.name || (settings.groups[bucket] ? "Selected group unavailable" : "No destination selected")}</strong>{!settings.enabled && <span className="text-slate-500">(routing paused)</span>}</div></section>
      <section className="rounded-2xl border border-slate-200 p-5 sm:p-6"><h2 className="font-semibold">Country reference</h2><p className="mt-1 text-sm text-slate-500">Source: country_eligibility_ismira.pdf · 50 green-list countries · 196 red-list countries · 3 unlisted. Lists determine communication only.</p><div className="mt-4 grid gap-4 sm:grid-cols-2">{[{ title: "PDF green list", codes: PDF_PRIMARY_COUNTRIES }, { title: "PDF red list", codes: PDF_FOLLOWUP_COUNTRIES }].map(list => <details key={list.title} className="rounded-xl border border-slate-200 p-4"><summary className="cursor-pointer text-sm font-semibold">{list.title} ({list.codes.length})</summary><p className="mt-3 max-h-64 overflow-y-auto text-sm leading-7 text-slate-600">{countries.filter(country => list.codes.includes(country.code)).map(country => country.name).join(" · ")}</p></details>)}</div></section>
      <section className="rounded-2xl border border-slate-200 p-5 sm:p-6"><h2 className="font-semibold">Pending communication deliveries</h2><p className="mt-1 text-sm text-slate-500">Up to 50 oldest pending or failed deliveries. Applications are already saved in this CRM. Retry sends the subscriber to its recorded MailerLite group.</p>{deliveries.length === 0 ? <p className="mt-5 text-sm text-emerald-700">No deliveries waiting for retry.</p> : <div className="mt-5 divide-y divide-slate-100">{deliveries.map(delivery => <div key={delivery.id} className="flex flex-wrap items-center justify-between gap-4 py-4"><div className="min-w-0"><p className="break-all text-sm font-medium">{delivery.email}</p><p className="mt-1 text-xs text-slate-500">{groups.find(group => group.id === delivery.group_id)?.name || delivery.group_id} · {delivery.status} · {delivery.attempts} attempts</p>{delivery.last_error && <p className="mt-2 text-sm text-rose-700">{delivery.last_error}</p>}</div><button className={button} disabled={!!retrying || !settings.enabled || dirty} onClick={() => void retry(delivery.id)}>{retrying === delivery.id ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}Retry</button></div>)}</div>}</section>
    </>}
  </div>;
}
