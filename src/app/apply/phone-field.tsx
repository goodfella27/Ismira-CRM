"use client";
import { useMemo, useRef, useState } from "react";
import { Popover } from "radix-ui";
import { Check, ChevronDown, Search } from "lucide-react";
import { getCountries, getCountryCallingCode, type CountryCode } from "libphonenumber-js/min";
import type { ApplicationLanguage } from "@/lib/application-form";

import styles from './position-select.module.css';
const searchCopy = {
  en: ['Search country or code…', 'No countries found.'],
  lt: ['Ieškoti šalies ar kodo…', 'Šalių nerasta.'],
  pl: ['Szukaj kraju lub kodu…', 'Nie znaleziono krajów.'],
  uk: ['Пошук країни або коду…', 'Країн не знайдено.'],
  de: ['Land oder Vorwahl suchen…', 'Keine Länder gefunden.'],
  ru: ['Поиск страны или кода…', 'Страны не найдены.'],
};
const normalize = (value:string) => value.normalize('NFD').replace(/\p{M}/gu,'').toLocaleLowerCase();
export function PhoneField({country, number, onCountryChange, onNumberChange, language, label, countryLabel, invalid}: {
  country: CountryCode; number: string; onCountryChange: (value: CountryCode) => void; onNumberChange: (value: string) => void;
  language: ApplicationLanguage; label: string; countryLabel: string; invalid: boolean;
}) {
  const [open,setOpen]=useState(false),[query,setQuery]=useState('');
  const inputRef=useRef<HTMLInputElement>(null);
  const optionRefs=useRef<(HTMLButtonElement|null)[]>([]);
  const [searchLabel,emptyLabel]=searchCopy[language];
  function choose(code:CountryCode){onCountryChange(code);setOpen(false);setQuery('');}
  const countries = useMemo(() => {
    const names = new Intl.DisplayNames([language], {type:"region"});
    return getCountries().map(code=>({code,name:names.of(code)||code,dial:getCountryCallingCode(code)})).sort((a,b)=>a.name.localeCompare(b.name,language));
  },[language]);
  const term=normalize(query.trim());
  const filtered=countries.filter(item=>normalize(item.name).includes(term) || item.code.toLowerCase().includes(term) || (term.replace(/^\+/, '') !== '' && item.dial.startsWith(term.replace(/^\+/, ''))));
  const flag = (code: string) => <span aria-hidden="true" className="h-4 w-6 shrink-0 rounded-sm bg-cover bg-center ring-1 ring-black/10" style={{backgroundImage:`url(/flags/${(code === "AC" || code === "TA" ? "SH" : code).toLowerCase()}.svg)`}}/>;
  return <div className={`flex rounded-xl border bg-white focus-within:ring-4 focus-within:ring-sky-100 ${invalid ? 'border-rose-500' : 'border-slate-300 focus-within:border-sky-500'}`}>
    <Popover.Root open={open} onOpenChange={next=>{setOpen(next);if(!next)setQuery('');}}>
      <Popover.Trigger aria-label={countryLabel} className="flex shrink-0 items-center gap-2 rounded-l-xl px-3 py-3.5 text-sm text-slate-700 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500">
        {flag(country)}<span>+{getCountryCallingCode(country)}</span><ChevronDown size={14} aria-hidden="true"/>
      </Popover.Trigger>
      <Popover.Portal><Popover.Content side="top" avoidCollisions={false} align="start" sideOffset={8} aria-label={countryLabel} className={`${styles.panel} ${styles.countryPanel} ${styles.phonePanel}`}>
        <div className={styles.search}><Search size={17} aria-hidden="true"/><input ref={inputRef} autoFocus aria-label={searchLabel} placeholder={searchLabel} value={query} onChange={event=>setQuery(event.target.value)} onKeyDown={event=>{if(event.key==='ArrowDown'){event.preventDefault();optionRefs.current[0]?.focus();}if(event.key==='Enter'){event.preventDefault();if(filtered.length===1)choose(filtered[0].code);}}}/></div>
        <div className={styles.options}>{filtered.map((item,index)=><button type="button" ref={element=>{optionRefs.current[index]=element;}} key={item.code} aria-pressed={country===item.code} className={styles.option} onClick={()=>choose(item.code)} onKeyDown={event=>{if(event.key==='ArrowDown'){event.preventDefault();optionRefs.current[Math.min(index+1,filtered.length-1)]?.focus();}if(event.key==='ArrowUp'){event.preventDefault();if(index===0)inputRef.current?.focus();else optionRefs.current[index-1]?.focus();}}}>
          {flag(item.code)}<span>{item.name}</span><span className="ml-auto shrink-0 text-xs text-slate-500">+{item.dial}</span>{country===item.code && <Check size={14} className="shrink-0" aria-hidden="true"/>}
        </button>)}{!filtered.length && <p className={styles.empty} role="status">{emptyLabel}</p>}</div>
      </Popover.Content></Popover.Portal>
    </Popover.Root>
    <input id="phone" name="phoneNational" type="tel" inputMode="tel" autoComplete="tel-national" required maxLength={24} value={number} onChange={event=>onNumberChange(event.target.value)} aria-label={label} aria-invalid={invalid} aria-describedby={invalid ? 'phone-error phone-help' : 'phone-help'} className="min-w-0 w-full rounded-r-xl border-l border-slate-200 px-3 py-3.5 text-base font-medium text-slate-900 outline-none"/>
  </div>;
}
