"use client";
import { useRef, useState } from 'react';
import { Popover } from 'radix-ui';
import { Check, ChevronDown, Search } from 'lucide-react';
import type { ApplicationLanguage } from '@/lib/application-form';
import styles from './position-select.module.css';

const copy = {
 en: ['Search countries…', 'No countries found.'],
 lt: ['Ieškoti šalies…', 'Šalių nerasta.'],
 pl: ['Szukaj kraju…', 'Nie znaleziono krajów.'],
 uk: ['Пошук країни…', 'Країн не знайдено.'],
 de: ['Land suchen…', 'Keine Länder gefunden.'],
 ru: ['Поиск страны…', 'Страны не найдены.'],
};
const normalize = (text:string) => text.normalize('NFD').replace(/\p{M}/gu,'').toLocaleLowerCase();
function Flag({code}:{code:string}) {
 return <span aria-hidden="true" className={styles.flag} style={{backgroundImage:`url(/flags/${code.toLowerCase()}.svg)`}}/>;
}
export function CitizenshipSelect({value,onChange,countries,language,label,placeholder,invalid}: {
 value:string; onChange:(code:string)=>void; countries:{code:string;label:string}[]; language:ApplicationLanguage; label:string; placeholder:string; invalid:boolean;
}) {
 const [open,setOpen]=useState(false),[query,setQuery]=useState('');
 const searchRef=useRef<HTMLInputElement>(null);
 const optionRefs=useRef<(HTMLButtonElement|null)[]>([]);
 const [searchLabel,emptyLabel]=copy[language];
 const filtered=countries.filter(country=>normalize(country.label).includes(normalize(query.trim())) || country.code.toLowerCase().includes(query.trim().toLowerCase()));
 const selected=countries.find(country=>country.code===value);
 function choose(code:string){onChange(code);setOpen(false);setQuery('');}
 return <Popover.Root open={open} onOpenChange={next=>{setOpen(next);if(!next)setQuery('');}}>
  <Popover.Trigger id="citizenship" aria-label={label} aria-required="true" aria-invalid={invalid} aria-describedby={invalid?'citizenship-error':undefined} className={styles.trigger}>
   <span className={styles.countryValue}>{selected && <Flag code={selected.code}/>}<span>{selected?.label ?? placeholder}</span></span><ChevronDown size={18} aria-hidden="true"/>
  </Popover.Trigger>
  <Popover.Portal><Popover.Content align="start" side="top" avoidCollisions={false} sideOffset={8} collisionPadding={16} aria-label={label} className={`${styles.panel} ${styles.countryPanel}`}>
   <div className={styles.search}><Search size={17} aria-hidden="true"/><input ref={searchRef} autoFocus aria-label={searchLabel} placeholder={searchLabel} value={query} onChange={event=>setQuery(event.target.value)} onKeyDown={event=>{if(event.key==='ArrowDown'){event.preventDefault();optionRefs.current[0]?.focus();}if(event.key==='Enter'){event.preventDefault();if(filtered.length===1)choose(filtered[0].code);}}}/></div>
   <div className={styles.options}>{filtered.map((country,index)=><button type="button" ref={element=>{optionRefs.current[index]=element;}} key={country.code} aria-pressed={value===country.code} className={styles.option} onClick={()=>choose(country.code)} onKeyDown={event=>{if(event.key==='ArrowDown'){event.preventDefault();optionRefs.current[Math.min(index+1,filtered.length-1)]?.focus();}if(event.key==='ArrowUp'){event.preventDefault();if(index===0)searchRef.current?.focus();else optionRefs.current[index-1]?.focus();}}}>
    <Flag code={country.code}/><span>{country.label}</span>{value===country.code && <Check size={16} className={styles.countryCheck} aria-hidden="true"/>}
   </button>)}{!filtered.length && <p className={styles.empty} role="status">{emptyLabel}</p>}</div>
  </Popover.Content></Popover.Portal>
 </Popover.Root>;
}
