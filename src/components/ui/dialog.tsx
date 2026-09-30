"use client";
import * as React from "react";
import { Dialog as Primitive } from "radix-ui";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
export const Dialog = Primitive.Root;
export const DialogTrigger = Primitive.Trigger;
export const DialogClose = Primitive.Close;
export const DialogTitle = Primitive.Title;
export const DialogDescription = Primitive.Description;
export function DialogContent({
  className,
  children,
  showClose = true,
  ...props
}: React.ComponentProps<typeof Primitive.Content> & { showClose?: boolean }) {
  return (
    <Primitive.Portal>
      <Primitive.Overlay className="fixed inset-0 z-[10000] bg-overlay data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 duration-150" />
      <Primitive.Content
        className={cn(
          "fixed left-1/2 top-1/2 z-[10001] max-h-[90svh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-dialog border border-border bg-popover p-6 text-popover-foreground shadow-overlay duration-150 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
          className,
        )}
        {...props}
      >
        {children}
        {showClose && (
          <Primitive.Close
            aria-label="Close dialog"
            className="absolute right-3 top-3 flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X size={16} />
          </Primitive.Close>
        )}
      </Primitive.Content>
    </Primitive.Portal>
  );
}
