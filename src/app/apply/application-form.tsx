"use client";

import { applicationJobOptions, type ApplicationJobOption } from "@/lib/application-job-options";
import { PositionSelect } from "./position-select";
import { PrivacyExplanation } from "./privacy-explanation";
import { CitizenshipSelect } from "./citizenship-select";
import { LevelSelect } from "./level-select";
import { PhoneField } from "./phone-field";
import { introTranslations } from "./intro-translations";
import { applicationPhone } from "@/lib/application-phone";
import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js/min";
import { CvDropzone } from "./cv-dropzone";
import styles from "./application-wizard.module.css";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Hotel, Wrench, Ship, BriefcaseBusiness, Compass, UserRound, ClipboardCheck, ArrowLeft, ArrowRight, Check, CheckCircle2, Clock3, Loader2, ShieldCheck, X } from "lucide-react";
import logo from "@/images/ismira_logo.png";
import { APPLICATION_EXPERIENCE, APPLICATION_LEVELS, APPLICATION_WIZARD_FIELDS, EMPTY_APPLICATION, validateApplicationStage, validateApplicationCV, type ApplicationLanguage, type ApplicationValues } from "@/lib/application-form";
import { applicationTranslations } from "./translations";
import { applicationCountryCodes } from "./countries";
import { LanguageSelect } from "./language-select";

const inputStyle = "w-full rounded-xl border border-slate-300 bg-white px-4 py-3.5 text-base font-medium text-slate-900 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100 aria-[invalid=true]:border-rose-500";
type ErrorKey = keyof typeof applicationTranslations.en.errors;

export default function ApplicationForm() {
  const [language, setLanguage] = useState<ApplicationLanguage>("en");
  const [step, setStep] = useState(-1);
  const [furthestStep, setFurthestStep] = useState(-1);
  const [history, setHistory] = useState<"" | "first" | "returning">("");
  const [phoneCountry, setPhoneCountry] = useState<CountryCode>("LT");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [jobs, setJobs] = useState<ApplicationJobOption[]>([]);
  const [direction, setDirection] = useState("forward");
  const scrollRef = useRef<HTMLDivElement>(null);
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
  const intro = introTranslations[language];
  const stepLabels = [intro.step, t.steps[0], t.steps[1], intro.experienceStep, t.steps[2], t.steps[3]];
  const stageTitles = [t.titles[0], t.titles[1], t.experience, t.titles[2], t.titles[3]];
  const stageSubtitles = [t.subtitles[0], intro.workHelp, intro.experienceHelp, t.subtitles[2], t.subtitles[3]];
  const positionOptions = useMemo(() => applicationJobOptions(jobs, values.department), [jobs, values.department]);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/jobs', {signal: controller.signal})
      .then(response => { if (!response.ok) throw new Error('Jobs unavailable'); return response.json(); })
      .then(data => { if (Array.isArray(data.jobs)) setJobs(data.jobs.filter((job: ApplicationJobOption) => typeof job?.name === 'string' && (!job.department || typeof job.department === 'string'))); })
      .catch(() => { /* Manual entry remains available when suggestions cannot load. */ });
    return () => controller.abort();
  }, []);
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
  useEffect(() => { if (step === 4) void refreshChallenge(); }, [step]);
  function update(key: keyof ApplicationValues, value: string | boolean) {
    setValues(previous => ({ ...previous, [key]: value }));
    setErrors(previous => { const next = {...previous}; delete next[key]; delete next.submit; return next; });
  }
  function goToStep(next: number) {
    setDirection(next < step ? "back" : "forward");
    setFurthestStep(previous => Math.max(previous, next));
    setStep(next); setErrors({});
    scrollRef.current?.scrollTo({ top: 0, behavior: "instant" });
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
  function choiceGroup(key: "department" | "experience" | "isAdult", options: {value:string; label:string; help?:string}[]) {
    if (key === "department") return <fieldset aria-describedby={errors.department ? "department-error" : undefined}>
      <legend className="mb-3 text-sm font-semibold text-slate-800">{t.department} <span className="text-sky-700">*</span></legend>
      <div className={styles.departmentGrid}>{options.map(option => {
        const Icon = option.value === 'Hotel' ? Hotel : Wrench;
        return <label key={option.value} className={styles.departmentCard} data-selected={values.department === option.value}>
          <input type="radio" name="department" value={option.value} checked={values.department === option.value} onChange={()=>update('department',option.value)} className={styles.departmentRadio}/>
          <span className={styles.departmentIcon}><Icon size={25} strokeWidth={1.6} aria-hidden="true"/></span>
          <span className={styles.departmentTitle}>{option.label}</span>
          <span className={styles.departmentDescription}>{option.help}</span>
        </label>;
      })}</div>{errorFor('department')}</fieldset>;
    return <fieldset aria-describedby={errors[key] ? `${key}-error` : undefined}><legend className={key === "experience" ? "sr-only" : "mb-3 text-sm font-semibold text-slate-800"}>{t[key]} <span className="text-sky-700">*</span></legend><div className={key === "experience" ? "space-y-3" : "grid gap-3 sm:grid-cols-2"}>{options.map(option => <label key={option.value} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition hover:border-sky-400 ${values[key] === option.value ? "border-sky-500 bg-sky-50 ring-1 ring-sky-500" : "border-slate-200 bg-white"}`}><input required className="mt-1 h-4 w-4 shrink-0 accent-sky-600" type="radio" name={key} value={option.value} checked={values[key] === option.value} onChange={() => update(key,option.value)} /><span><span className="block text-sm font-medium leading-6 text-slate-800">{option.label}</span>{option.help && <span className="mt-1 block text-xs leading-5 text-slate-500">{option.help}</span>}</span></label>)}</div>{errorFor(key)}</fieldset>;
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
    if (step === -1) {
      if (!history) { setErrors({history:"required"}); return; }
      if (history === "first") goToStep(0);
      return;
    }
    const stepErrors = validateApplicationStage(values,step);
    if (Object.keys(stepErrors).length) { setErrors(stepErrors); return; }
    if (step < 4) { goToStep(step + 1); return; }
    for (let index = 0; index < 4; index++) {
      const previousErrors = validateApplicationStage(values,index);
      if (Object.keys(previousErrors).length) { goToStep(index); setErrors(previousErrors); return; }
    }
    const fileError = validateApplicationCV(cv);
    if (fileError) { setErrors({ cv: fileError }); return; }
    if (!challenge || !/^\d{1,2}$/.test(answer.trim())) { setErrors({challenge: "captcha"}); return; }
    busyRef.current = true; setSubmitting(true); setErrors({});
    try {
      const payload = new FormData();
      for (const [key,value] of Object.entries(values)) payload.set(key, typeof value === "boolean" ? value ? "yes" : "no" : value.trim());
      payload.set("citizenship", values.citizenship);
      payload.set("formVersion","multistep"); payload.set("language",language);
      const positionId = new URLSearchParams(window.location.search).get("positionId");
      if (positionId) payload.set("positionId", positionId);
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

  const StepIcon = step < 0 ? Compass : [UserRound, Hotel, Wrench, Ship, BriefcaseBusiness, Compass, ClipboardCheck][step];
  return <div lang={language} className={styles.wizard}>
    <aside className={styles.rail}>
      <Link href="/" aria-label="Ismira" className={styles.brand}><Image src={logo} alt="Ismira" priority className="h-auto w-14" /></Link>
      <ol aria-label={t.step} className={styles.steps}>{stepLabels.map((label,position) => <li key={position}>
        <button type="button" aria-label={label} aria-current={position-1 === step ? "step" : undefined} disabled={submitting || success || (history === "returning" && position > 0) || position-1 > furthestStep} onClick={() => goToStep(position-1)} className={styles.stepButton} title={label}>
          <span className={styles.stepNumber}>{success || (position-1 < furthestStep && position-1 !== step) ? <Check size={19}/> : `0${position+1}`}</span>
          <span className={styles.stepLabel}>{label}</span>
        </button>
      </li>)}</ol>
      <span className={styles.railMark} aria-hidden="true"><Ship size={23}/></span>
    </aside>
    <div className={styles.surface}>
      <header className={styles.topbar}>
        <button type="button" disabled={step === -1 || submitting || success} onClick={() => goToStep(step-1)} aria-label={t.back} className={styles.backIcon}><ArrowLeft size={19}/></button>
        <div className={styles.stepMeta}><strong>{stepLabels[step+1]}</strong><span>{t.step} {step+2} {t.of} {stepLabels.length}</span></div>
        <div className={styles.headerActions}><LanguageSelect value={language} onChange={setLanguage} label={t.language}/><Link href="/" className={styles.exit}><X size={16}/><span>{t.backJobs}</span></Link></div>
      </header>
      <div className={styles.progress} role="progressbar" aria-label={t.step} aria-valuenow={success ? stepLabels.length : step+2} aria-valuemin={0} aria-valuemax={stepLabels.length}><div style={{width:`${(success ? stepLabels.length : step+2)/stepLabels.length*100}%`}}/></div>
      <section className={styles.main}>
        {success ? <div className={styles.success}><CheckCircle2 size={56} className="mb-6 text-emerald-600"/><h1 ref={headingRef} tabIndex={-1} className="text-3xl font-semibold outline-none">{t.success}</h1><p className="mt-4 max-w-md leading-7 text-slate-500">{t.successText}</p><Link href="/" className={styles.primary}>{t.browse}</Link></div> :
          <form noValidate onSubmit={handleSubmit} aria-busy={submitting} className={styles.form}>
            <fieldset disabled={submitting} className={styles.fieldset}>
              <div ref={scrollRef} className={styles.scroll}>
                <div key={step} className={styles.stage} data-direction={direction}>
                  <div className={styles.fields}>
                    <header className={styles.heading}><p>{t.eyebrow}</p><h1 ref={headingRef} tabIndex={-1}>{step < 0 ? intro.title : stageTitles[step]}</h1><div>{step < 0 ? intro.subtitle : stageSubtitles[step]}</div></header>
                    <div className="space-y-6">
              {step === -1 && <fieldset><legend className="sr-only">{intro.title}</legend><div className="space-y-3">{([['first',intro.first],['returning',intro.returning]] as const).map(([value,label]) => <label key={value} className={`flex cursor-pointer items-center gap-4 rounded-xl border p-5 transition ${history === value ? 'border-sky-500 bg-sky-50' : 'border-slate-200 hover:border-slate-400'}`}><input type="radio" name="history" value={value} checked={history===value} onChange={()=>{setHistory(value);setErrors({});}} className="h-4 w-4 accent-sky-700"/><span className="text-sm font-medium">{label}</span></label>)}</div>{errorFor("history")}{history === "returning" && <p className="mt-5 text-sm leading-6 text-slate-500">{intro.returningText}</p>}</fieldset>}
              {step === 0 && <>{textField("email","email","email")}<div className="grid gap-6 sm:grid-cols-2">{textField("firstName","text","given-name")}{textField("lastName","text","family-name")}</div><div><label htmlFor="phone" className="mb-2 block text-sm font-semibold text-slate-800">{t.phone} <span className="text-sky-700">*</span></label><PhoneField country={phoneCountry} number={phoneNumber} language={language} label={t.phone} countryLabel={intro.country} invalid={!!errors.phone} onCountryChange={country=>{setPhoneCountry(country);update('phone',applicationPhone(phoneNumber,country));}} onNumberChange={number=>{const parsed=number.trim().startsWith('+') ? parsePhoneNumberFromString(number) : undefined;const country=parsed?.country ?? phoneCountry;const national=parsed?.country ? String(parsed.nationalNumber) : number;setPhoneCountry(country);setPhoneNumber(national);update('phone',applicationPhone(national,country));}}/><p id="phone-help" className="mt-2 text-sm leading-5 text-slate-500">{intro.phoneHelp}</p>{errorFor("phone")}</div></>}
              {step === 1 && <>{choiceGroup("department",[{value:"Hotel",label:t.hotel,help:t.hotelHelp},{value:"Technical",label:t.technical,help:t.technicalHelp}])}{field("desiredPosition",<PositionSelect value={values.desiredPosition} onChange={value=>update("desiredPosition",value)} options={positionOptions} label={t.desiredPosition} placeholder={intro.positionsPlaceholder} searchLabel={intro.positionsSearch} emptyLabel={intro.positionsEmpty} addLabel={intro.positionsAdd} removeLabel={t.remove} limitLabel={intro.positionsLimit} invalid={!!errors.desiredPosition}/>,intro.positionHelp)}</>}
              {step === 2 && choiceGroup("experience",APPLICATION_EXPERIENCE.map((value,index)=>({value,label:t.experienceOptions[index]})))}
              {step === 3 && <>{choiceGroup("isAdult",[{value:"Yes",label:t.yes},{value:"No",label:t.no}])}{field("citizenship",<CitizenshipSelect value={values.citizenship} onChange={code=>update("citizenship",code)} countries={countries} language={language} label={t.citizenship} placeholder={t.select} invalid={!!errors.citizenship}/>)}{field("englishLevel",<LevelSelect value={values.englishLevel} onChange={value=>update("englishLevel",value)} options={APPLICATION_LEVELS.map((value,index)=>({value,label:t.levels[index]}))} label={t.englishLevel} placeholder={t.select} invalid={!!errors.englishLevel}/>)}</>}
              {step === 4 && <>
                <div className="divide-y divide-slate-100">{[0,1,2,3].map(section => <div key={section} className="py-4 first:pt-0"><div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold">{stepLabels[section+1]}</h3><button type="button" onClick={()=>goToStep(section)} aria-label={`${t.edit}: ${stepLabels[section+1]}`} className="text-xs font-semibold text-sky-700 hover:underline">{t.edit}</button></div><dl className="space-y-2">{APPLICATION_WIZARD_FIELDS[section].map(key=><div key={key} className="grid gap-1 text-sm sm:grid-cols-[40%_1fr]"><dt className="text-slate-500">{t[key as keyof typeof t] as string}</dt><dd className="break-words font-medium text-slate-800">{readable(key)}</dd></div>)}</dl></div>)}</div>
                <div><div className="mb-2 flex items-center gap-2"><label htmlFor="cv" className="text-sm font-semibold">{t.cv}</label><span className="text-xs text-slate-400">{t.optional}</span></div><CvDropzone file={cv} language={language} uploadLabel={t.upload} removeLabel={t.remove} help={t.cvHelp} disabled={submitting} invalid={!!errors.cv} onChange={file => { setCv(file); const error = validateApplicationCV(file); setErrors(previous => { const next = {...previous}; delete next.cv; if (error) next.cv = error; return next; }); }} />{errorFor("cv")}</div>
                <div><label className="flex items-start gap-3 text-sm leading-6"><input id="consent" required type="checkbox" checked={values.consent} onChange={event=>update("consent",event.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-sky-600"/><span>{t.consent} <a href="https://ismira.lt/privacy-policy/" target="_blank" rel="noreferrer" className="font-medium text-sky-700 underline">{t.privacy}</a>. *</span></label>{errorFor("consent")}</div>
                <div className="rounded-xl border border-slate-200 p-4"><label htmlFor="challenge" className="mb-3 block text-sm font-semibold">{t.captcha} *</label><div className="flex flex-wrap items-center gap-3"><span className="min-w-20 font-mono text-lg">{challenge?.question ?? "…"} =</span><input id="challenge" required inputMode="numeric" autoComplete="off" maxLength={2} value={answer} onChange={event=>setAnswer(event.target.value)} className={`${inputStyle} max-w-24`} aria-describedby="challenge-help"/><button type="button" onClick={()=>void refreshChallenge()} className="text-xs font-medium text-sky-700 hover:underline">{t.retry}</button></div><p id="challenge-help" className="mt-2 text-xs text-slate-500">{t.captchaHelp}</p>{errorFor("challenge")}</div>
              </>}
                    </div>
                    {errorFor("submit")}
                  </div>
                  {step < 4 && <aside className={styles.visual} aria-hidden="true">
                    <div className={styles.orbit}><div className={styles.orbitInner}/><span className={styles.orbitDot}/><div className={styles.visualIcon}><StepIcon size={86} strokeWidth={1.15}/></div><span className={styles.visualCheck}><Check size={20}/></span></div>
                    <p className={styles.visualHeadline}>{t.headline}</p><p className={styles.visualIntro}>{t.intro}</p>
                    <div className={styles.assurance}><Clock3 size={15}/>{t.time}</div>
                  </aside>}
                </div>
              </div>
              <footer className={styles.footer}>
                <button type="button" disabled={step === -1} onClick={() => goToStep(step-1)} className={styles.back}><ArrowLeft size={17}/>{t.back}</button>
                <div className={styles.privacy}><span className={styles.privacyIcon}><ShieldCheck size={20} aria-hidden="true"/></span><div><p>{intro.privacyTitle}</p><PrivacyExplanation language={language} label={intro.privacyLink} title={intro.privacyTitle} policyLabel={t.privacy}/></div></div>
                <div className={styles.footerAction}><p className={styles.requiredNote}>{t.requiredNote}</p>{step === -1 && history === "returning" ? <Link href="/" className={styles.primary}>{t.backJobs}<ArrowRight size={17}/></Link> : <button type="submit" className={styles.primary}>{submitting ? <><Loader2 size={17} className="animate-spin"/>{t.submitting}</> : <>{step === 4 ? t.submit : t.next}<ArrowRight size={17}/></>}</button>}</div>
              </footer>
            </fieldset>
          </form>}
      </section>
    </div>
  </div>;
}
