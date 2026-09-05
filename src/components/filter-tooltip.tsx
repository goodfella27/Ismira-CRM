"use client";

import type { ReactElement } from "react";
import { Popover, Tooltip } from "radix-ui";
import { Info } from "lucide-react";

const contentClass = "z-[200] max-w-[min(18rem,calc(100vw-2rem))] rounded-xl bg-slate-900 px-4 py-3 text-sm leading-relaxed text-white shadow-lg";

export function FilterTooltip({ label, text, open, onOpenChange, children }: {
  label: string;
  text: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children?: ReactElement;
}) {
  if (!text) return children ?? null;
  if (children) {
    return (
      <Tooltip.Provider delayDuration={0}>
        <Tooltip.Root open={open} onOpenChange={onOpenChange}>
          <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Content side="top" sideOffset={6} collisionPadding={16} className={contentClass}>
              {text}
              <Tooltip.Arrow className="fill-slate-900" />
            </Tooltip.Content>
          </Tooltip.Portal>
        </Tooltip.Root>
      </Tooltip.Provider>
    );
  }
  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={`About ${label}`}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-sky-50 hover:text-sky-700 focus-visible:outline-2 focus-visible:outline-sky-500"
        >
          <Info className="h-4 w-4" aria-hidden="true" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="top"
          sideOffset={6}
          collisionPadding={16}
          onOpenAutoFocus={event => event.preventDefault()}
          onCloseAutoFocus={event => event.preventDefault()}
          className={contentClass}
        >
          {text}
          <Popover.Arrow className="fill-slate-900" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
