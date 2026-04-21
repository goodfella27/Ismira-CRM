"use client";

import type { ReactNode } from "react";

type DetailsModalShellProps = {
  open: boolean;
  labelledBy: string;
  onClose: () => void;
  hero: ReactNode;
  heroActions?: ReactNode;
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
  stickyHeader,
  children,
  footer,
  zIndexClassName = "z-[9999]",
  panelClassName = "border border-white/10 bg-white shadow-[0_30px_80px_-50px_rgba(0,0,0,0.8)]",
  backdropClassName = "bg-slate-950/60 backdrop-blur-sm",
}: DetailsModalShellProps) {
  if (!open) return null;

  return (
    <div
      className={`fixed inset-0 ${zIndexClassName} flex items-center justify-center px-4 py-6 sm:px-6`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      onClick={onClose}
    >
      <div className={`absolute inset-0 ${backdropClassName}`} />
      <div
        className={`relative z-10 w-full max-w-4xl overflow-hidden rounded-3xl ${panelClassName}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="hide-scrollbar max-h-[80vh] overflow-auto">
          <div className="relative overflow-hidden">
            {hero}
            {heroActions ? (
              <div className="absolute right-4 top-4 flex flex-wrap items-center gap-2">
                {heroActions}
              </div>
            ) : null}
          </div>

          {stickyHeader}

          <div className="bg-white px-6 py-6">{children}</div>
          {footer}
        </div>
      </div>
    </div>
  );
}
