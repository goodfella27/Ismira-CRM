"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AlertTriangle } from "lucide-react";

type DialogTone = "default" | "danger";

type ConfirmOptions = {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  tone?: DialogTone;
};

type PromptOptions = {
  title: string;
  message?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmText?: string;
  cancelText?: string;
  tone?: DialogTone;
  required?: boolean;
};

type DialogState =
  | null
  | ({ kind: "confirm" } & Required<Pick<ConfirmOptions, "title">> &
      Omit<ConfirmOptions, "title">)
  | ({ kind: "prompt" } & Required<Pick<PromptOptions, "title">> &
      Omit<PromptOptions, "title">);

type DialogContextValue = {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  prompt: (options: PromptOptions) => Promise<string | null>;
};

const DialogContext = createContext<DialogContextValue | null>(null);

export function useAppDialogs() {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error("useAppDialogs must be used within <AppDialogsProvider />");
  return ctx;
}

function Button({
  children,
  onClick,
  tone = "default",
  variant = "secondary",
  disabled,
  autoFocus,
}: {
  children: ReactNode;
  onClick?: () => void;
  tone?: DialogTone;
  variant?: "primary" | "secondary";
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  const base =
    "inline-flex items-center justify-center rounded-full px-5 py-2.5 text-sm font-semibold shadow-sm transition focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-60";

  const secondary =
    "border border-slate-200 bg-white text-slate-800 hover:bg-slate-50 focus:ring-slate-300";

  const primaryDefault =
    "bg-slate-900 text-white hover:bg-black focus:ring-slate-900 focus:ring-offset-white";

  const primaryDanger =
    "bg-rose-600 text-white hover:bg-rose-700 focus:ring-rose-500 focus:ring-offset-white";

  const cls =
    variant === "secondary"
      ? `${base} ${secondary}`
      : `${base} ${tone === "danger" ? primaryDanger : primaryDefault}`;

  return (
    <button type="button" className={cls} onClick={onClick} disabled={disabled} autoFocus={autoFocus}>
      {children}
    </button>
  );
}

export function AppDialogsProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<DialogState>(null);
  const [promptValue, setPromptValue] = useState("");
  const resolveRef = useRef<((value: boolean | string | null) => void) | null>(
    null
  );

  const close = useCallback((result: boolean | string | null) => {
    const resolve = resolveRef.current;
    resolveRef.current = null;
    setDialog(null);
    setPromptValue("");
    if (resolve) resolve(result);
  }, []);

  const confirm = useCallback(
    (options: ConfirmOptions) => {
      return new Promise<boolean>((resolve) => {
        resolveRef.current = (value) => resolve(value === true);
        setDialog({
          kind: "confirm",
          title: options.title,
          message: options.message,
          confirmText: options.confirmText ?? "OK",
          cancelText: options.cancelText ?? "Cancel",
          tone: options.tone ?? "default",
        });
      });
    },
    []
  );

  const prompt = useCallback(
    (options: PromptOptions) => {
      return new Promise<string | null>((resolve) => {
        resolveRef.current = (value) =>
          resolve(typeof value === "string" ? value : null);
        setPromptValue(options.defaultValue ?? "");
        setDialog({
          kind: "prompt",
          title: options.title,
          message: options.message,
          placeholder: options.placeholder,
          confirmText: options.confirmText ?? "Save",
          cancelText: options.cancelText ?? "Cancel",
          tone: options.tone ?? "default",
          required: options.required ?? true,
        });
      });
    },
    []
  );

  const value = useMemo(() => ({ confirm, prompt }), [confirm, prompt]);

  useEffect(() => {
    if (!dialog) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close(dialog.kind === "prompt" ? null : false);
      }
      if (event.key === "Enter" && dialog.kind === "confirm") {
        event.preventDefault();
        close(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dialog, close]);

  const confirmDisabled =
    dialog?.kind === "prompt" && dialog.required ? !promptValue.trim() : false;

  return (
    <DialogContext.Provider value={value}>
      {children}
      {dialog ? (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center px-4 py-6 sm:px-6"
          role="dialog"
          aria-modal="true"
          aria-label={dialog.title}
          onClick={() => close(dialog.kind === "prompt" ? null : false)}
        >
          <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" />
          <div
            className="relative z-10 w-full max-w-lg overflow-hidden rounded-3xl border border-white/10 bg-white shadow-[0_30px_80px_-50px_rgba(0,0,0,0.8)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start gap-4 border-b border-slate-200 bg-white px-6 py-5">
              <div className="mt-1 grid h-10 w-10 place-items-center rounded-2xl bg-amber-100 text-amber-800">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-lg font-semibold text-slate-900">{dialog.title}</div>
                {dialog.message ? (
                  <div className="mt-1 text-sm leading-6 text-slate-600">{dialog.message}</div>
                ) : null}
              </div>
            </div>

            {dialog.kind === "prompt" ? (
              <div className="bg-white px-6 py-5">
                <input
                  value={promptValue}
                  onChange={(e) => setPromptValue(e.target.value)}
                  placeholder={dialog.placeholder ?? ""}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-300 focus:ring-2 focus:ring-slate-900/10"
                />
              </div>
            ) : null}

            <div className="flex items-center justify-end gap-3 bg-white px-6 py-5">
              <Button
                variant="secondary"
                onClick={() => close(dialog.kind === "prompt" ? null : false)}
              >
                {dialog.cancelText ?? "Cancel"}
              </Button>
              <Button
                variant="primary"
                tone={dialog.tone ?? "default"}
                onClick={() =>
                  close(dialog.kind === "prompt" ? promptValue.trim() : true)
                }
                disabled={confirmDisabled}
                autoFocus
              >
                {dialog.confirmText ?? "OK"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </DialogContext.Provider>
  );
}
