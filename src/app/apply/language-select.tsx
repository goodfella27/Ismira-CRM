"use client";

import { Select } from "radix-ui";
import { Check, ChevronDown } from "lucide-react";
import type { ApplicationLanguage } from "@/lib/application-form";

const languages: { value: ApplicationLanguage; label: string; country: string }[] = [
  { value: "en", label: "English", country: "gb" },
  { value: "lt", label: "Lietuvių", country: "lt" },
  { value: "pl", label: "Polski", country: "pl" },
  { value: "uk", label: "Українська", country: "ua" },
  { value: "de", label: "Deutsch", country: "de" },
  { value: "ru", label: "Русский", country: "ru" },
];

function Flag({ country }: { country: string }) {
  // Local SVGs keep flags consistent on systems without flag emoji support.
  return <span aria-hidden="true" className="h-5 w-7 shrink-0 rounded-[4px] bg-cover bg-center ring-1 ring-black/10" style={{ backgroundImage: `url(/flags/${country}.svg)` }} />;
}

export function LanguageSelect({ value, onChange, label }: {
  value: ApplicationLanguage;
  onChange: (value: ApplicationLanguage) => void;
  label: string;
}) {
  return <Select.Root value={value} onValueChange={value => onChange(value as ApplicationLanguage)}>
    <Select.Trigger aria-label={label} className="flex min-w-40 items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-[#103c4a] outline-none transition hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-sky-500 data-[state=open]:border-slate-400 data-[state=open]:bg-slate-50 [&>span]:flex [&>span]:items-center [&>span]:gap-3">
      <Select.Value />
      <Select.Icon><ChevronDown size={16} /></Select.Icon>
    </Select.Trigger>
    <Select.Portal>
      <Select.Content position="popper" align="end" sideOffset={10} collisionPadding={16} className="z-50 w-64 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_16px_48px_rgba(15,23,42,0.16)]">
        <Select.Viewport className="max-h-[var(--radix-select-content-available-height)]">
          <Select.Group>
            <Select.Label className="px-3 pb-3 pt-2 text-xs font-semibold text-slate-500">{label}</Select.Label>
            {languages.map(language => <Select.Item key={language.value} value={language.value} className="relative flex cursor-pointer select-none items-center rounded-xl px-3 py-3 pr-10 text-sm font-medium text-[#103c4a] outline-none data-[state=checked]:bg-sky-50 data-[highlighted]:bg-slate-100">
              <Select.ItemText><span lang={language.value} className="flex items-center gap-3"><Flag country={language.country} />{language.label}</span></Select.ItemText>
              <Select.ItemIndicator className="absolute right-3"><Check size={18} /></Select.ItemIndicator>
            </Select.Item>)}
          </Select.Group>
        </Select.Viewport>
      </Select.Content>
    </Select.Portal>
  </Select.Root>;
}
