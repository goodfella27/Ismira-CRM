"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Anchor, ArrowLeft, ArrowRight, Check, CheckCircle2, Clock3, Globe2, Loader2, ShieldCheck, UploadCloud, X } from "lucide-react";
import logo from "@/images/ismira_logo.png";
import { APPLICATION_EXPERIENCE, APPLICATION_LEVELS, APPLICATION_STEPS, EMPTY_APPLICATION, validateApplication, validateApplicationCV, type ApplicationLanguage, type ApplicationValues } from "@/lib/application-form";
import { applicationTranslations } from "./translations";
import { applicationCountryCodes } from "./countries";

const inputStyle = "w-full rounded-xl border border-slate-300 bg-white px-4 py-3.5 text-base text-slate-900 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100 aria-[invalid=true]:border-rose-500";
type ErrorKey = keyof typeof applicationTranslations.en.errors;

export default function ApplicationForm() {
  const [language, setLanguage] = useState<ApplicationLanguage>("en");
  const [step, setStep] = useState(0);
  const [values, setValues] = useState<ApplicationValues>(EMPTY_APPLICATION);
  const [cv, setCv] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, ErrorKey>>({});
  const [challenge, setChallenge] = useState<{question: string; token: string} | null>(null);
  const [answer, setAnswer] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const busyRef = useRef(false);
  const t = applicationTranslations[language];
  const countries = useMemo(() => {
    const names = new Intl.DisplayNames([language], { type: "region" });
    return applicationCountryCodes.map(code => ({ code, label: names.of(code) || code })).sort((a,b) => a.label.localeCompare(b.label, language));
  }, [language]);
  const countryLabel = countries.find(country => country.code === values.citizenship)?.label ?? values.citizenship;

  async function refreshChallenge() {
    setChallenge(null); setAnswer("");
    try {
      const response = await fetch("/api/jobs/form/challenge", { cache: "no-store" });
      if (!response.ok) throw new Error();
      const data = await response.json();
      setChallenge(data);
      setErrors(previous => { const next = {...previous}; delete next.challenge; return next; });
    } catch { setErrors(previous => ({ ...previous, challenge: "captcha" })); }
  }
  useEffect(() => { if (step === 3) void refreshChallenge(); }, [step]);
  function update(key: keyof ApplicationValues, value: string | boolean) {
    setValues(previous => ({ ...previous, [key]: value }));
    setErrors(previous => { const next = {...previous}; delete next[key]; delete next.submit; return next; });
  }
  function goToStep(next: number) {
    setStep(next); setErrors({});
    requestAnimationFrame(() => headingRef.current?.focus());
  }
  function errorFor(key: string) {
    return errors[key] ? <p id={`${key}-error`} className="mt-2 text-sm text-rose-700" role="alert">{t.errors[errors[key]]}</p> : null;
  }
  function field(key: keyof ApplicationValues, children: ReactNode, help?: string) {
    return <div><label htmlFor={key} className="mb-2 block text-sm font-semibold text-slate-800">{t[key as keyof typeof t] as string} <span className="text-sky-700">*</span></label>{children}{help && <p className="mt-2 text-sm leading-5 text-slate-500">{help}</p>}{errorFor(key)}</div>;
  }
  function textField(key: "firstName" | "lastName" | "email" | "phone" | "desiredPosition", type = "text", autoComplete?: string, help?: string) {
    return field(key, <input id={key} name={key} required type={type} autoComplete={autoComplete} maxLength={key === "desiredPosition" ? 120 : key === "email" ? 254 : key === "phone" ? 24 : 80} value={values[key]} onChange={event => update(key,event.target.value)} aria-invalid={!!errors[key]} aria-describedby={errors[key] ? `${key}-error` : undefined} className={inputStyle} />, help);
  }
  function selectField(key: "citizenship" | "englishLevel", options: {value: string; label: string}[]) {
    return field(key, <select id={key} name={key} required value={values[key]} onChange={event => update(key,event.target.value)} aria-invalid={!!errors[key]} aria-describedby={errors[key] ? `${key}-error` : undefined} className={inputStyle}><option value="">{t.select}</option>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>);
  }
  function choiceGroup(key: "department" | "experience" | "isAdult", options: {value:string; label:string; help?:string}[]) {
    return <fieldset aria-describedby={errors[key] ? `${key}-error` : undefined}><legend className="mb-3 text-sm font-semibold text-slate-800">{t[key]} <span className="text-sky-700">*</span></legend><div className={key === "experience" ? "space-y-3" : "grid gap-3 sm:grid-cols-2"}>{options.map(option => <label key={option.value} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition hover:border-sky-400 ${values[key] === option.value ? "border-sky-500 bg-sky-50 ring-1 ring-sky-500" : "border-slate-200 bg-white"}`}><input required className="mt-1 h-4 w-4 shrink-0 accent-sky-600" type="radio" name={key} value={option.value} checked={values[key] === option.value} onChange={() => update(key,option.value)} /><span><span className="block text-sm font-medium leading-6 text-slate-800">{option.label}</span>{option.help && <span className="mt-1 block text-xs leading-5 text-slate-500">{option.help}</span>}</span></label>)}</div>{errorFor(key)}</fieldset>;
  }
  function readable(key: keyof ApplicationValues) {
    const value = values[key];
    if (key === "department") return value === "Hotel" ? t.hotel : t.technical;
    if (key === "experience") return t.experienceOptions[APPLICATION_EXPERIENCE.indexOf(value as typeof APPLICATION_EXPERIENCE[number])];
    if (key === "isAdult") return value === "Yes" ? t.yes : t.no;
    if (key === "citizenship") return countryLabel;
    if (key === "englishLevel") return t.levels[APPLICATION_LEVELS.indexOf(value as typeof APPLICATION_LEVELS[number])];
    return String(value);
  }
  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (busyRef.current) return;
    const stepErrors = validateApplication(values,step);
    if (Object.keys(stepErrors).length) { setErrors(stepErrors); return; }
    if (step < 3) { goToStep(step + 1); return; }
    for (let index = 0; index < 3; index++) {
      const previousErrors = validateApplication(values,index);
      if (Object.keys(previousErrors).length) { goToStep(index); setErrors(previousErrors); return; }
    }
    const fileError = validateApplicationCV(cv);
    if (fileError) { setErrors({ cv: fileError }); return; }
    if (!challenge || !/^\d{1,2}$/.test(answer.trim())) { setErrors({challenge: "captcha"}); return; }
    busyRef.current = true; setSubmitting(true); setErrors({});
    try {
      const payload = new FormData();
      for (const [key,value] of Object.entries(values)) payload.set(key, typeof value === "boolean" ? value ? "yes" : "no" : value.trim());
      payload.set("citizenship", new Intl.DisplayNames(["en"],{type:"region"}).of(values.citizenship) || values.citizenship);
      payload.set("formVersion","multistep"); payload.set("language",language);
      payload.set("challengeToken",challenge.token); payload.set("challengeAnswer",answer.trim());
      if (cv) payload.set("cv",cv,cv.name);
      const response = await fetch("/api/jobs/form/submit",{method:"POST",body:payload});
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.ok) {
        setErrors({ [result?.code === "captcha" ? "challenge" : "submit"]: result?.code === "captcha" ? "captcha" : "submit" });
        return;
      }
      setSuccess(true); setCv(null); setValues(EMPTY_APPLICATION);
      requestAnimationFrame(() => headingRef.current?.focus());
    } catch { setErrors({submit:"submit"}); }
    finally { busyRef.current = false; setSubmitting(false); }
  }

  return <div lang={language} className="min-h-screen bg-[#f4f7fa] text-slate-900">
    <header className="border-b border-slate-200 bg-white px-5 sm:px-10"><div className="mx-auto flex min-h-24 max-w-6xl items-center justify-between gap-4 py-4"><Link href="/" aria-label="Ismira"><Image src={logo} alt="Ismira" priority className="h-10 w-auto sm:h-12" /></Link><div className="flex items-center gap-6"><Link href="/" className="hidden items-center gap-2 text-sm font-medium text-slate-600 hover:text-sky-700 sm:flex"><ArrowLeft size={16}/>{t.backJobs}</Link><label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2"><Globe2 size={17} className="text-slate-500"/><span className="sr-only">{t.language}</span><select aria-label={t.language} value={language} onChange={event => setLanguage(event.target.value as ApplicationLanguage)} className="max-w-32 bg-transparent text-sm outline-none focus:ring-2 focus:ring-sky-400"><option value="en">English</option><option value="ru">Русский</option><option value="es">Español</option></select></label></div></div></header>
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-8 sm:py-12">
      <div className="grid overflow-hidden rounded-3xl bg-white shadow-[0_12px_60px_-30px_rgba(15,23,42,0.25)] lg:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="relative flex flex-col bg-[#103c4a] px-6 py-7 text-white sm:px-9 lg:py-11">
          <div className="mb-7 hidden lg:block"><Anchor size={28} className="mb-8 text-sky-200"/><p className="text-[10px] font-semibold tracking-[0.2em] text-sky-200">{t.eyebrow}</p><h1 className="mt-4 whitespace-pre-line text-3xl font-semibold leading-tight tracking-tight">{t.headline}</h1><p className="mt-4 text-sm leading-6 text-slate-200">{t.intro}</p></div>
          <ol aria-label={t.step} className="grid grid-cols-4 gap-2 lg:mt-3 lg:grid-cols-1 lg:gap-6">{t.steps.map((label,index) => <li key={index} aria-current={index === step ? "step" : undefined} className="flex flex-col items-center gap-2 lg:flex-row lg:gap-4"><span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors ${index <= step ? "bg-white text-[#103c4a]" : "border border-white/30 text-white/60"}`}>{index < step || success ? <Check size={16}/> : `0${index+1}`}</span><span className={`text-center text-[10px] font-medium sm:text-xs lg:text-left lg:text-sm ${index <= step ? "text-white" : "text-white/60"}`}>{label}</span></li>)}</ol>
          <div className="mt-auto hidden pt-14 text-xs leading-5 text-slate-200 lg:block"><p className="mb-3 flex items-center gap-2"><Clock3 size={15}/>{t.time}</p><p className="flex items-start gap-2"><ShieldCheck size={16} className="mt-0.5 shrink-0"/>{t.private}</p></div>
        </aside>
        <section className="min-w-0 px-6 py-8 sm:px-10 sm:py-11">
          {success ? <div className="flex min-h-[470px] flex-col items-center justify-center text-center"><CheckCircle2 size={56} className="mb-6 text-emerald-600"/><h2 ref={headingRef} tabIndex={-1} className="text-3xl font-semibold outline-none">{t.success}</h2><p className="mt-4 max-w-md leading-7 text-slate-500">{t.successText}</p><Link href="/" className="mt-8 rounded-xl bg-sky-600 px-6 py-3 font-semibold text-white hover:bg-sky-700">{t.browse}</Link></div> : <>
          <p className="text-xs font-semibold uppercase tracking-widest text-sky-700">{t.step} {step+1} {t.of} 4</p><h2 ref={headingRef} tabIndex={-1} className="mt-3 text-2xl font-semibold tracking-tight outline-none sm:text-3xl">{t.titles[step]}</h2><p className="mt-3 max-w-lg text-sm leading-6 text-slate-500">{t.subtitles[step]}</p>
          <div className="my-6 h-1 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-label={t.step} aria-valuenow={step+1} aria-valuemin={0} aria-valuemax={4}><div className="h-full rounded-full bg-sky-500 motion-safe:transition-all motion-safe:duration-300" style={{width:`${(step+1)*25}%`}}/></div>
          <form noValidate onSubmit={handleSubmit} aria-busy={submitting}>
            <fieldset disabled={submitting} className="min-w-0">
            <div className="space-y-6" key={step}>
              {step === 0 && <><div className="grid gap-6 sm:grid-cols-2">{textField("firstName","text","given-name")}{textField("lastName","text","family-name")}</div>{textField("email","email","email")}{textField("phone","tel","tel",t.phoneHelp)}</>}
              {step === 1 && <>{choiceGroup("department",[{value:"Hotel",label:t.hotel,help:t.hotelHelp},{value:"Technical",label:t.technical,help:t.technicalHelp}])}{textField("desiredPosition","text",undefined,t.desiredHelp)}{choiceGroup("experience",APPLICATION_EXPERIENCE.map((value,index)=>({value,label:t.experienceOptions[index]})))}</>}
              {step === 2 && <>{choiceGroup("isAdult",[{value:"Yes",label:t.yes},{value:"No",label:t.no}])}{selectField("citizenship",countries.map(country=>({value:country.code,label:country.label})))}{selectField("englishLevel",APPLICATION_LEVELS.map((value,index)=>({value,label:t.levels[index]})))}</>}
              {step === 3 && <>
                <div className="divide-y divide-slate-100">{[0,1,2].map(section => <div key={section} className="py-4 first:pt-0"><div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold">{t.steps[section]}</h3><button type="button" onClick={()=>goToStep(section)} aria-label={`${t.edit}: ${t.steps[section]}`} className="text-xs font-semibold text-sky-700 hover:underline">{t.edit}</button></div><dl className="space-y-2">{APPLICATION_STEPS[section].map(key=><div key={key} className="grid gap-1 text-sm sm:grid-cols-[40%_1fr]"><dt className="text-slate-500">{t[key as keyof typeof t] as string}</dt><dd className="break-words font-medium text-slate-800">{readable(key)}</dd></div>)}</dl></div>)}</div>
                <div><div className="mb-2 flex items-center gap-2"><label htmlFor="cv" className="text-sm font-semibold">{t.cv}</label><span className="text-xs text-slate-400">{t.optional}</span></div><div className="relative rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5"><UploadCloud className="mb-3 text-sky-600" size={25}/><label htmlFor="cv" className="inline-flex cursor-pointer rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-sky-700 focus-within:ring-2 focus-within:ring-sky-500">{t.upload}<input id="cv" type="file" accept=".pdf,.doc,.docx" aria-label={t.upload} onChange={event=>{const file=event.target.files?.[0]??null;setCv(file);const err=validateApplicationCV(file);setErrors(err?{cv:err}:{});}} className="sr-only"/></label>{cv && <div className="mt-3 flex items-center justify-between gap-2 text-sm"><span className="break-all">{cv.name}</span><button type="button" aria-label={t.remove} onClick={()=>{setCv(null);setErrors({});const input=document.getElementById("cv") as HTMLInputElement|null;if(input)input.value="";}} className="rounded p-1 hover:bg-slate-200"><X size={16}/></button></div>}<p className="mt-3 text-xs leading-5 text-slate-500">{t.cvHelp}</p></div>{errorFor("cv")}</div>
                <div><label className="flex items-start gap-3 text-sm leading-6"><input id="consent" required type="checkbox" checked={values.consent} onChange={event=>update("consent",event.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-sky-600"/><span>{t.consent} <a href="https://ismira.lt/privacy-policy/" target="_blank" rel="noreferrer" className="font-medium text-sky-700 underline">{t.privacy}</a>. *</span></label>{errorFor("consent")}</div>
                <div className="rounded-xl border border-slate-200 p-4"><label htmlFor="challenge" className="mb-3 block text-sm font-semibold">{t.captcha} *</label><div className="flex flex-wrap items-center gap-3"><span className="min-w-20 font-mono text-lg">{challenge?.question ?? "…"} =</span><input id="challenge" required inputMode="numeric" autoComplete="off" maxLength={2} value={answer} onChange={event=>setAnswer(event.target.value)} className={`${inputStyle} max-w-24`} aria-describedby="challenge-help"/><button type="button" onClick={()=>void refreshChallenge()} className="text-xs font-medium text-sky-700 hover:underline">{t.retry}</button></div><p id="challenge-help" className="mt-2 text-xs text-slate-500">{t.captchaHelp}</p>{errorFor("challenge")}</div>
              </>}
            </div>
            {errorFor("submit")}
            <div className="mt-8 flex items-center justify-between gap-3 border-t border-slate-100 pt-6">{step > 0 ? <button type="button" onClick={()=>goToStep(step-1)} className="flex items-center gap-2 rounded-xl px-3 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50"><ArrowLeft size={17}/>{t.back}</button> : <span className="max-w-36 text-xs leading-5 text-slate-400">{t.requiredNote}</span>}<button type="submit" className="flex items-center justify-center gap-3 rounded-xl bg-sky-600 px-5 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-600 disabled:opacity-60">{submitting ? <><Loader2 size={17} className="animate-spin"/>{t.submitting}</> : <>{step === 3 ? t.submit : t.next}<ArrowRight size={17}/></>}</button></div>
            </fieldset>
          </form></>}
        </section>
      </div>
      <footer className="mt-7 flex flex-wrap justify-between gap-3 px-1 text-xs text-slate-500"><span>© {new Date().getFullYear()} Ismira</span><a href="https://ismira.lt/privacy-policy/" target="_blank" rel="noreferrer" className="hover:text-sky-700">{t.privacy}</a></footer>
    </div>
  </div>;
}
