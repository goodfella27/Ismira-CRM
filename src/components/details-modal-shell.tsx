"use client";

import { useRef, type ReactNode } from "react";
import { Dialog as Primitive } from "radix-ui";

type DetailsModalShellProps = {
  open: boolean;
  labelledBy: string;
  onClose: () => void;
  hero: ReactNode;
  heroActions?: ReactNode;
  stickyHeroActions?: boolean;
  stickyHeader?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  zIndexClassName?: string;
  panelClassName?: string;
  backdropClassName?: string;
};

export default function DetailsModalShell({
  open,
  labelledBy,
  onClose,
  hero,
  heroActions,
  stickyHeroActions = false,
  stickyHeader,
  children,
  footer,
  zIndexClassName = "z-[9999]",
  panelClassName = "border border-border bg-card shadow-overlay",
  backdropClassName = "bg-overlay",
}: DetailsModalShellProps) {
  const openerRef = useRef<HTMLElement | null>(null);
  if (!open) return null;

  return (
    <Primitive.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <Primitive.Portal>
        <Primitive.Overlay
          className={`fixed inset-0 ${zIndexClassName} ${backdropClassName}`}
        />
        <Primitive.Content
          onOpenAutoFocus={() => {
            openerRef.current = document.activeElement as HTMLElement | null;
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (openerRef.current?.isConnected) openerRef.current.focus();
          }}
          aria-labelledby={labelledBy}
          aria-describedby={undefined}
          className={`fixed left-1/2 top-1/2 ${zIndexClassName} w-[calc(100%-1rem)] max-w-[67.2rem] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-dialog text-foreground sm:w-[calc(100%-3rem)] ${panelClassName}`}
        >
          <Primitive.Title className="sr-only">Details</Primitive.Title>
          <div className="hide-scrollbar max-h-[94svh] overflow-auto xl:max-h-[80vh]">
            {stickyHeroActions && heroActions ? (
              <div className="sticky top-4 z-20 h-0 overflow-visible">
                <div className="flex justify-end px-4">
                  <div className="pointer-events-auto flex flex-wrap items-center gap-2">
                    {heroActions}
                  </div>
                </div>
              </div>
            ) : null}
            <div className="relative overflow-hidden">
              {hero}
              {!stickyHeroActions && heroActions ? (
                <div className="absolute right-4 top-4 flex flex-wrap items-center gap-2">
                  {heroActions}
                </div>
              ) : null}
            </div>

            {stickyHeader}

            <div className="bg-card px-4 py-4 xl:px-6 xl:py-6">{children}</div>
            {footer}
          </div>
        </Primitive.Content>
      </Primitive.Portal>
    </Primitive.Root>
  );
}
