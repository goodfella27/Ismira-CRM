"use client";

import { useEffect, useId, useRef, useState, type DragEvent } from "react";
import { Check, FileText, FileUp, X } from "lucide-react";
import type { ApplicationLanguage } from "@/lib/application-form";
import styles from "./cv-dropzone.module.css";

const copy = {
  en: { drop: "Drop your CV here", release: "Release to attach your CV", one: "Please choose one CV at a time." },
  lt: { drop: "Vilkite savo CV čia", release: "Paleiskite, kad pridėtumėte CV", one: "Pasirinkite vieną CV failą." },
  pl: { drop: "Przeciągnij tutaj swoje CV", release: "Upuść, aby dodać CV", one: "Wybierz jeden plik CV naraz." },
  uk: { drop: "Перетягніть своє резюме сюди", release: "Відпустіть, щоб додати резюме", one: "Виберіть один файл резюме." },
  de: { drop: "Lebenslauf hier ablegen", release: "Loslassen, um den Lebenslauf anzuhängen", one: "Bitte wählen Sie jeweils einen Lebenslauf aus." },
  ru: { drop: "Перетащите резюме сюда", release: "Отпустите, чтобы прикрепить резюме", one: "Выберите один файл резюме." },
};

type Props = {
  file: File | null;
  onChange: (file: File | null) => void;
  language: ApplicationLanguage;
  uploadLabel: string;
  removeLabel: string;
  help: string;
  disabled?: boolean;
  invalid?: boolean;
};

export function CvDropzone({ file, onChange, language, uploadLabel, removeLabel, help, disabled, invalid }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const surface = useRef<HTMLButtonElement>(null);
  const depth = useRef(0);
  const reducedMotion = useRef(true);
  const [dragging, setDragging] = useState(false);
  const [multipleError, setMultipleError] = useState(false);
  const helpId = useId();
  const t = copy[language];

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => { reducedMotion.current = query.matches; };
    sync(); query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  function resetMotion() {
    surface.current?.style.removeProperty("transform");
  }
  function lean(clientX: number, clientY: number) {
    if (disabled || reducedMotion.current || !surface.current) return;
    const box = surface.current.parentElement!.getBoundingClientRect();
    const x = Math.max(-1, Math.min(1, ((clientX-box.left)/box.width-.5)*2));
    const y = Math.max(-1, Math.min(1, ((clientY-box.top)/box.height-.5)*2));
    surface.current.style.transform = `perspective(850px) rotateX(${-y*4}deg) rotateY(${x*4}deg) translate3d(${x*3}px,${y*3}px,0)`;
  }
  function choose(files: FileList | null) {
    if (disabled || !files?.length) return;
    setMultipleError(files.length > 1);
    if (files.length === 1) onChange(files[0]);
  }
  function isFileDrag(event: DragEvent) { return Array.from(event.dataTransfer.types).includes("Files"); }

  return <div className={styles.wrapper}>
    <div className={styles.zone}
      onDragEnter={event => { if (!isFileDrag(event)) return; event.preventDefault(); if (!disabled) { depth.current++; setDragging(true); } }}
      onDragOver={event => { if (!isFileDrag(event)) return; event.preventDefault(); event.dataTransfer.dropEffect = disabled ? "none" : "copy"; if (!disabled) lean(event.clientX,event.clientY); }}
      onDragLeave={event => { event.preventDefault(); if (--depth.current <= 0) { depth.current = 0; setDragging(false); resetMotion(); } }}
      onDrop={event => { event.preventDefault(); depth.current = 0; setDragging(false); resetMotion(); choose(event.dataTransfer.files); }}>
      <input ref={input} id="cv" type="file" accept=".pdf,.doc,.docx" disabled={disabled} tabIndex={-1} className={styles.input}
        onChange={event => { choose(event.target.files); event.target.value = ""; }} />
      <button ref={surface} type="button" disabled={disabled} className={styles.surface} data-dragging={dragging} data-invalid={invalid || multipleError}
        aria-label={uploadLabel} aria-describedby={`${helpId}${invalid ? " cv-error" : ""}${multipleError ? ` ${helpId}-error` : ""}`}
        onClick={() => input.current?.click()} onPointerMove={event => { if (event.pointerType === "mouse") lean(event.clientX,event.clientY); }} onPointerLeave={resetMotion} onBlur={resetMotion}>
        <span className={styles.icon} aria-hidden="true">{file && !invalid ? <Check size={26} strokeWidth={1.5}/> : <FileUp size={26} strokeWidth={1.5}/>}</span>
        <strong>{dragging ? t.release : t.drop}</strong>
        <span className={styles.browse}>{uploadLabel}</span>
        <span id={helpId} className={styles.help}>{help}</span>
      </button>
    </div>
    {multipleError && <p id={`${helpId}-error`} className="mt-2 text-sm text-rose-700" role="alert">{t.one}</p>}
    {file && <div className={styles.file} data-invalid={invalid} aria-live="polite">
      <FileText size={22} aria-hidden="true"/>
      <span className={styles.fileName}>{file.name}<small>{new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(file.size / 1024)} KB</small></span>
      <button type="button" disabled={disabled} aria-label={removeLabel} className={styles.remove} onClick={() => { onChange(null); setMultipleError(false); if(input.current) input.current.value=""; }}><X size={17}/></button>
    </div>}
  </div>;
}
