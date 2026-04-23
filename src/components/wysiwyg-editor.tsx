"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  Link2,
  Eraser,
} from "lucide-react";

import { useAppDialogs } from "@/components/app-dialogs";

type WysiwygEditorProps = {
  value: string;
  onChange: (nextHtml: string) => void;
  placeholder?: string;
  disabled?: boolean;
  minHeightClassName?: string;
};

function normalizeHtml(value: string) {
  return (value ?? "").toString();
}

function decodeHtmlEntities(input: string) {
  if (typeof window === "undefined") return input;
  const textarea = document.createElement("textarea");
  textarea.innerHTML = input;
  return textarea.value;
}

function sanitizeForEditor(input: string) {
  const raw = (input ?? "").toString();
  if (!raw.trim()) return "";
  if (typeof window === "undefined") return "";

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(raw, "text/html");

    const blockedTags = new Set([
      "script",
      "style",
      "iframe",
      "object",
      "embed",
      "link",
      "meta",
      "base",
      "form",
      "input",
      "button",
      "textarea",
      "select",
      "option",
    ]);

    const removeNodes = Array.from(
      doc.querySelectorAll(Array.from(blockedTags).join(","))
    );
    removeNodes.forEach((node) => node.remove());

    const elements = Array.from(doc.body.querySelectorAll("*"));
    elements.forEach((el) => {
      Array.from(el.attributes).forEach((attr) => {
        const name = attr.name.toLowerCase();
        const value = attr.value;

        if (name.startsWith("on") || name === "style") {
          el.removeAttribute(attr.name);
          return;
        }

        if (name === "href" || name === "src") {
          const trimmed = value.trim();
          const lower = trimmed.toLowerCase();
          const allowed =
            lower.startsWith("https://") ||
            lower.startsWith("http://") ||
            lower.startsWith("mailto:") ||
            lower.startsWith("tel:") ||
            (name === "src" && lower.startsWith("data:image/"));
          if (!allowed || lower.startsWith("javascript:")) {
            el.removeAttribute(attr.name);
          }
        }

        const allowedAttrs = new Set([
          "href",
          "src",
          "alt",
          "title",
          "target",
          "rel",
          "width",
          "height",
        ]);
        if (!allowedAttrs.has(name)) {
          el.removeAttribute(attr.name);
        }
      });

      if (el.tagName.toLowerCase() === "a") {
        el.setAttribute("target", "_blank");
        el.setAttribute("rel", "noopener noreferrer");
      }

      if (el.tagName.toLowerCase() === "img") {
        if (!el.getAttribute("alt")) el.setAttribute("alt", "");
        el.setAttribute("loading", "lazy");
        el.setAttribute("decoding", "async");
        el.setAttribute("referrerpolicy", "no-referrer");
      }
    });

    return doc.body.innerHTML;
  } catch {
    return "";
  }
}

export default function WysiwygEditor({
  value,
  onChange,
  placeholder = "",
  disabled = false,
  minHeightClassName = "min-h-[180px]",
}: WysiwygEditorProps) {
  const dialogs = useAppDialogs();
  const editorRef = useRef<HTMLDivElement | null>(null);
  const [focused, setFocused] = useState(false);

  const safeValue = useMemo(() => normalizeHtml(value), [value]);
  const renderedHtml = useMemo(() => {
    // Some upstream sources store Breezy HTML as escaped entities (e.g. &lt;p&gt;...).
    // Decode once (sometimes twice) then sanitize before rendering into the editor.
    let decoded = safeValue;
    for (let i = 0; i < 2; i += 1) {
      const next = decodeHtmlEntities(decoded);
      if (next === decoded) break;
      decoded = next;
    }
    return sanitizeForEditor(decoded);
  }, [safeValue]);

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (focused) return;
    if (el.innerHTML === renderedHtml) return;
    el.innerHTML = renderedHtml;
  }, [focused, renderedHtml]);

  const emitChange = () => {
    const el = editorRef.current;
    if (!el) return;
    onChange(el.innerHTML);
  };

  const exec = (command: string, commandValue?: string) => {
    if (disabled) return;
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    // eslint-disable-next-line deprecation/deprecation
    document.execCommand(command, false, commandValue);
    emitChange();
  };

  const onAddLink = async () => {
    if (disabled) return;
    const url = await dialogs.prompt({
      title: "Add link",
      message: "Paste a URL (https://...)",
      confirmText: "Add",
      cancelText: "Cancel",
      defaultValue: "https://",
    });
    if (!url) return;
    const trimmed = url.trim();
    if (!trimmed) return;
    exec("createLink", trimmed);
  };

  return (
    <div className="w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 bg-slate-50 px-2 py-2">
        <button
          type="button"
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-transparent text-slate-700 transition hover:bg-white disabled:opacity-50"
          onClick={() => exec("bold")}
          disabled={disabled}
          title="Bold"
        >
          <Bold className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-transparent text-slate-700 transition hover:bg-white disabled:opacity-50"
          onClick={() => exec("italic")}
          disabled={disabled}
          title="Italic"
        >
          <Italic className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-transparent text-slate-700 transition hover:bg-white disabled:opacity-50"
          onClick={() => exec("underline")}
          disabled={disabled}
          title="Underline"
        >
          <Underline className="h-4 w-4" />
        </button>
        <div className="mx-1 h-6 w-px bg-slate-200" />
        <button
          type="button"
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-transparent text-slate-700 transition hover:bg-white disabled:opacity-50"
          onClick={() => exec("insertUnorderedList")}
          disabled={disabled}
          title="Bulleted list"
        >
          <List className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-transparent text-slate-700 transition hover:bg-white disabled:opacity-50"
          onClick={() => exec("insertOrderedList")}
          disabled={disabled}
          title="Numbered list"
        >
          <ListOrdered className="h-4 w-4" />
        </button>
        <div className="mx-1 h-6 w-px bg-slate-200" />
        <button
          type="button"
          className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-transparent px-3 text-slate-700 transition hover:bg-white disabled:opacity-50"
          onClick={() => void onAddLink()}
          disabled={disabled}
          title="Add link"
        >
          <Link2 className="h-4 w-4" />
          <span className="text-xs font-semibold">Link</span>
        </button>
        <button
          type="button"
          className="ml-auto inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-transparent px-3 text-slate-700 transition hover:bg-white disabled:opacity-50"
          onClick={() => exec("removeFormat")}
          disabled={disabled}
          title="Clear formatting"
        >
          <Eraser className="h-4 w-4" />
          <span className="text-xs font-semibold">Clear</span>
        </button>
      </div>

      <div className="relative">
        <div
          ref={editorRef}
          className={[
            minHeightClassName,
            "w-full px-4 py-3 text-sm text-slate-800 outline-none",
            "focus:ring-2 focus:ring-emerald-100",
            disabled ? "bg-slate-50 text-slate-500" : "bg-white",
            "[&_*]:max-w-full [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-2xl [&_img]:border [&_img]:border-slate-200",
            "[&_a]:font-semibold [&_a]:text-emerald-700 [&_a:hover]:underline",
            "[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5",
          ].join(" ")}
          contentEditable={!disabled}
          suppressContentEditableWarning
          data-placeholder={placeholder}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            emitChange();
          }}
          onInput={emitChange}
          onPaste={(event) => {
            if (disabled) return;
            event.preventDefault();
            const text = event.clipboardData.getData("text/plain");
            if (!text) return;
            // eslint-disable-next-line deprecation/deprecation
            document.execCommand("insertText", false, text);
            emitChange();
          }}
        />
        {!safeValue.trim() ? (
          <div className="pointer-events-none absolute left-4 top-3 text-sm text-slate-400">
            {placeholder}
          </div>
        ) : null}
      </div>
    </div>
  );
}
