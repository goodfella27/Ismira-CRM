"use client";
import { Select } from 'radix-ui';
import { Check, ChevronDown } from 'lucide-react';
import styles from './position-select.module.css';

export function LevelSelect({value,onChange,options,label,placeholder,invalid}: {
 value:string; onChange:(value:string)=>void; options:{value:string;label:string}[]; label:string; placeholder:string; invalid:boolean;
}) {
 return <Select.Root value={value} onValueChange={onChange} required>
  <Select.Trigger id="englishLevel" aria-label={label} aria-invalid={invalid} aria-describedby={invalid?'englishLevel-error':undefined} className={styles.trigger}>
   <Select.Value placeholder={placeholder}/><Select.Icon><ChevronDown size={18} aria-hidden="true"/></Select.Icon>
  </Select.Trigger>
  <Select.Portal><Select.Content position="popper" side="top" avoidCollisions={false} align="start" sideOffset={8} className={`${styles.panel} ${styles.levelPanel}`}>
   <Select.Viewport className={styles.options}>{options.map(option=><Select.Item key={option.value} value={option.value} className={`${styles.option} ${styles.levelOption}`}>
    <Select.ItemText>{option.label}</Select.ItemText><Select.ItemIndicator className={styles.countryCheck}><Check size={16} aria-hidden="true"/></Select.ItemIndicator>
   </Select.Item>)}</Select.Viewport>
  </Select.Content></Select.Portal>
 </Select.Root>;
}
