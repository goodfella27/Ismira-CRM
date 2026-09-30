"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

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
  if (!ctx)
    throw new Error("useAppDialogs must be used within <AppDialogsProvider />");
  return ctx;
}

export function AppDialogsProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<DialogState>(null);
  const [promptValue, setPromptValue] = useState("");
  const openerRef = useRef<HTMLElement | null>(null);
  const resolveRef = useRef<((value: boolean | string | null) => void) | null>(
    null,
  );

  const close = useCallback((result: boolean | string | null) => {
    const resolve = resolveRef.current;
    resolveRef.current = null;
    setDialog(null);
    setPromptValue("");
    if (resolve) resolve(result);
  }, []);

  const confirm = useCallback((options: ConfirmOptions) => {
    openerRef.current = document.activeElement as HTMLElement | null;
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
  }, []);

  const prompt = useCallback((options: PromptOptions) => {
    openerRef.current = document.activeElement as HTMLElement | null;
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
  }, []);

  const value = useMemo(() => ({ confirm, prompt }), [confirm, prompt]);

  const confirmDisabled =
    dialog?.kind === "prompt" && dialog.required ? !promptValue.trim() : false;

  return (
    <DialogContext.Provider value={value}>
      {children}
      <Dialog
        open={!!dialog}
        onOpenChange={(open) => {
          if (!open) close(dialog?.kind === "prompt" ? null : false);
        }}
      >
        {dialog && (
          <DialogContent
            showClose={false}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              if (openerRef.current?.isConnected) openerRef.current.focus();
            }}
          >
            <DialogTitle className="text-lg font-semibold tracking-tight">
              {dialog.title}
            </DialogTitle>
            <DialogDescription className="mt-2 text-sm leading-6 text-muted-foreground">
              {dialog.message || "Confirm your choice below."}
            </DialogDescription>
            {dialog.kind === "prompt" && (
              <form
                id="app-prompt"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!confirmDisabled) close(promptValue.trim());
                }}
                className="mt-5"
              >
                <Input
                  autoFocus
                  aria-label={dialog.title}
                  value={promptValue}
                  onChange={(event) => setPromptValue(event.target.value)}
                  placeholder={dialog.placeholder}
                />
              </form>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => close(dialog.kind === "prompt" ? null : false)}
              >
                {dialog.cancelText}
              </Button>
              <Button
                variant={dialog.tone === "danger" ? "destructive" : "primary"}
                disabled={confirmDisabled}
                onClick={() =>
                  close(dialog.kind === "prompt" ? promptValue.trim() : true)
                }
              >
                {dialog.confirmText}
              </Button>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </DialogContext.Provider>
  );
}
