"use client";
import { useState } from "react";
import { Popover } from "radix-ui";
import { Check, ChevronDown, Search, X, Plus } from "lucide-react";
import styles from './position-select.module.css';

export function PositionSelect({value,onChange,options,label,placeholder,searchLabel,emptyLabel,addLabel,removeLabel,limitLabel,invalid}: {
 value:string; onChange:(value:string)=>void; options:string[]; label:string; placeholder:string; searchLabel:string; emptyLabel:string; addLabel:string; removeLabel:string; limitLabel:string; invalid:boolean;
}) {
 const [open,setOpen]=useState(false),[query,setQuery]=useState('');
 const selected=value ? value.split('; ').filter(Boolean) : [];
 const filtered=options.filter(option=>option.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
 const custom=query.trim().replace(/;/g,',');
 const canAdd=custom.length>=2 && !options.some(option=>option.toLocaleLowerCase()===custom.toLocaleLowerCase()) && !selected.includes(custom);
 function toggle(option:string) {
  const next=selected.includes(option)?selected.filter(item=>item!==option):[...selected,option];
  if(next.join('; ').length<=120) onChange(next.join('; '));
 }
 return <div>
  <Popover.Root open={open} onOpenChange={next=>{setOpen(next);if(!next)setQuery('');}}>
   <Popover.Trigger id="desiredPosition" aria-label={label} aria-invalid={invalid} aria-describedby={invalid?'desiredPosition-error':undefined} className={styles.trigger}>
    <span>{value || placeholder}</span><ChevronDown size={18} aria-hidden="true"/>
   </Popover.Trigger>
   <Popover.Portal><Popover.Content align="start" sideOffset={8} collisionPadding={16} className={styles.panel}>
    <div className={styles.search}><Search size={17} aria-hidden="true"/><input autoFocus aria-label={searchLabel} placeholder={searchLabel} value={query} onChange={event=>setQuery(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();if(canAdd)toggle(custom);}}}/></div>
    <div className={styles.options}>
     {filtered.map(option=>{const checked=selected.includes(option);return <button type="button" key={option} aria-pressed={checked} disabled={!checked && [...selected,option].join('; ').length>120} className={styles.option} onClick={()=>toggle(option)}><span className={styles.check}>{checked && <Check size={14}/>}</span><span>{option}</span></button>;})}
     {!filtered.length && <p className={styles.empty}>{emptyLabel}</p>}
     {canAdd && <button type="button" className={styles.option} disabled={[...selected,custom].join('; ').length>120} onClick={()=>{toggle(custom);setQuery('');}}><Plus size={16}/><span>{addLabel}: {custom}</span></button>}
    </div>
    {selected.length>0 && <p className={styles.limit}>{limitLabel} ({value.length}/120)</p>}
   </Popover.Content></Popover.Portal>
  </Popover.Root>
  {!!selected.length && <div className={styles.chips}>{selected.map(option=><span key={option} className={styles.chip}><span>{option}</span><button type="button" aria-label={`${removeLabel}: ${option}`} onClick={()=>toggle(option)}><X size={14}/></button></span>)}</div>}
 </div>;
}
