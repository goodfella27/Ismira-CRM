"use client";
import { useEffect, useId, useRef, useState } from 'react';
import { Popover } from 'radix-ui';
import { ShieldCheck } from 'lucide-react';
import type { ApplicationLanguage } from '@/lib/application-form';
import styles from './privacy-explanation.module.css';

const copy = {
  "en": [
    "Your application and CV are kept private. Access within our recruitment system is restricted to authorised Ismira team members.",
    "These access controls help protect your information from unauthorised viewing or downloads. Your application is not publicly visible.",
    "We handle your information with care to manage your application and stay in touch about recruitment opportunities. Read our Privacy Policy for more details."
  ],
  "lt": [
    "Jūsų paraiška ir CV yra privatūs. Prieiga mūsų atrankos sistemoje suteikiama tik įgaliotiems „Ismira“ komandos nariams.",
    "Prieigos kontrolė padeda apsaugoti jūsų informaciją nuo neleistinos peržiūros ar atsisiuntimo. Jūsų paraiška nėra viešai matoma.",
    "Atsakingai tvarkome jūsų informaciją, kad galėtume nagrinėti paraišką ir susisiekti dėl darbo galimybių. Daugiau informacijos rasite Privatumo politikoje."
  ],
  "pl": [
    "Twoje zgłoszenie i CV są prywatne. Dostęp w naszym systemie rekrutacyjnym mają wyłącznie upoważnieni członkowie zespołu Ismira.",
    "Kontrola dostępu pomaga chronić Twoje informacje przed nieuprawnionym przeglądaniem lub pobieraniem. Twoje zgłoszenie nie jest publicznie widoczne.",
    "Dbamy o Twoje informacje, aby rozpatrzyć zgłoszenie i kontaktować się w sprawie możliwości zatrudnienia. Więcej szczegółów znajdziesz w Polityce prywatności."
  ],
  "uk": [
    "Ваша заявка та резюме є приватними. Доступ у нашій системі підбору персоналу мають лише уповноважені члени команди Ismira.",
    "Контроль доступу допомагає захистити вашу інформацію від несанкціонованого перегляду або завантаження. Ваша заявка не є загальнодоступною.",
    "Ми дбайливо обробляємо вашу інформацію, щоб розглянути заявку та підтримувати зв’язок щодо можливостей працевлаштування. Докладніше — у Політиці конфіденційності."
  ],
  "de": [
    "Ihre Bewerbung und Ihr Lebenslauf bleiben privat. In unserem Bewerbungssystem haben nur autorisierte Mitglieder des Ismira-Teams Zugriff.",
    "Diese Zugriffskontrollen helfen, Ihre Angaben vor unbefugter Einsicht und unbefugten Downloads zu schützen. Ihre Bewerbung ist nicht öffentlich sichtbar.",
    "Wir gehen sorgfältig mit Ihren Angaben um, bearbeiten damit Ihre Bewerbung und informieren Sie über berufliche Möglichkeiten. Weitere Einzelheiten finden Sie in unserer Datenschutzerklärung."
  ],
  "ru": [
    "Ваша заявка и резюме являются конфиденциальными. Доступ в нашей системе подбора персонала имеют только уполномоченные сотрудники Ismira.",
    "Контроль доступа помогает защитить ваши данные от несанкционированного просмотра или скачивания. Ваша заявка не находится в открытом доступе.",
    "Мы бережно обрабатываем ваши данные, чтобы рассмотреть заявку и поддерживать связь по вопросам трудоустройства. Подробнее — в Политике конфиденциальности."
  ]
};

export function PrivacyExplanation({language,label,title,policyLabel}: {language:ApplicationLanguage;label:string;title:string;policyLabel:string}) {
 const [open,setOpen]=useState(false);
 const timer=useRef<ReturnType<typeof setTimeout> | null>(null);
 const titleId=useId();
 function cancelClose(){if(timer.current)clearTimeout(timer.current);}
 function show(){cancelClose();setOpen(true);}
 function closeSoon(){cancelClose();timer.current=setTimeout(()=>setOpen(false),200);}
 useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current);},[]);
 return <Popover.Root open={open} onOpenChange={setOpen}>
  <Popover.Trigger asChild><button type="button" className={styles.trigger} onPointerEnter={event=>{if(event.pointerType==='mouse')show();}} onPointerLeave={closeSoon} onFocus={show} onClick={event=>{event.preventDefault();show();}}>{label}</button></Popover.Trigger>
  <Popover.Portal><Popover.Content side="top" sideOffset={12} collisionPadding={16} aria-labelledby={titleId} className={styles.panel} onOpenAutoFocus={event=>event.preventDefault()} onCloseAutoFocus={event=>event.preventDefault()} onPointerEnter={cancelClose} onPointerLeave={closeSoon} onFocusCapture={cancelClose}>
   <h2 id={titleId}><ShieldCheck size={20} aria-hidden="true"/>{title}</h2>
   {copy[language].map(text=><p key={text}>{text}</p>)}
   <a href="https://ismira.lt/privacy-policy/" target="_blank" rel="noreferrer">{policyLabel}</a>
   <Popover.Arrow className={styles.arrow}/>
  </Popover.Content></Popover.Portal>
 </Popover.Root>;
}
