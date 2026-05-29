"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Briefcase,
  ClipboardList,
  Mail,
  Building2,
  Layers,
  Workflow,
  SlidersHorizontal,
  Webhook,
  FolderKanban,
  MessageSquareQuote,
  MoreHorizontal,
} from "lucide-react";

import { cn } from "@/lib/utils";

const items = [
  {
    label: "Companies",
    href: "/breezy/companies",
    icon: Building2,
    description: "Browse companies",
  },
  {
    label: "Positions",
    href: "/breezy/positions",
    icon: Briefcase,
    description: "Browse job openings",
  },
  {
    label: "Pools",
    href: "/breezy/pools",
    icon: FolderKanban,
    description: "Browse candidate pools",
  },
  {
    label: "Pipelines",
    href: "/breezy/pipelines",
    icon: Workflow,
    description: "Stages & pipeline config",
  },
  {
    label: "Email templates",
    href: "/breezy/email-templates",
    icon: Mail,
    description: "Sync & manage templates",
  },
  {
    label: "Testimonials",
    href: "/breezy/testimonials",
    icon: MessageSquareQuote,
    description: "Candidate proof for jobs",
  },
  {
    label: "Departments",
    href: "/breezy/departments",
    icon: Layers,
    description: "Manage job departments",
  },
  {
    label: "Questionnaires",
    href: "/breezy/questionnaires",
    icon: ClipboardList,
    description: "Sync forms & scorecards",
  },
  {
    label: "Custom fields",
    href: "/breezy/custom-attributes",
    icon: SlidersHorizontal,
    description: "Attributes & field schema",
  },
  {
    label: "Webhooks",
    href: "/breezy/webhooks",
    icon: Webhook,
    description: "Endpoint subscriptions",
  },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function BreezyShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreWrapRef = useRef<HTMLDivElement | null>(null);

  const primaryItems = [items[0], items[1], items[2], items[4], items[5], items[6]].filter(Boolean);
  const moreItems = items.filter((item) => !primaryItems.includes(item));

  useEffect(() => {
    if (!moreOpen) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (!moreWrapRef.current) return;
      if (moreWrapRef.current.contains(target)) return;
      setMoreOpen(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMoreOpen(false);
    };

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [moreOpen]);

  return (
    <div className="p-6 sm:p-10">
      <div className="w-full max-w-none">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <nav className="flex items-center gap-2 overflow-x-auto pb-1 lg:flex-wrap lg:overflow-visible">
            {primaryItems.map((item) => {
              const active = isActive(pathname, item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group inline-flex shrink-0 items-center gap-2 rounded-2xl border px-3 py-2 text-sm font-semibold transition",
                    active
                      ? "border-emerald-200 bg-emerald-50 text-slate-900"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  )}
                  title={item.label}
                  aria-label={item.label}
                  onClick={() => setMoreOpen(false)}
                >
                  <span
                    className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-xl transition",
                      active
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-slate-100 text-slate-700 group-hover:bg-slate-200"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="whitespace-nowrap">{item.label}</span>
                </Link>
              );
            })}

            {moreItems.length ? (
              <div ref={moreWrapRef} className="relative shrink-0">
                <button
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={moreOpen}
                  className={cn(
                    "group inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm font-semibold transition",
                    moreOpen
                      ? "border-emerald-200 bg-emerald-50 text-slate-900"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  )}
                  onClick={() => setMoreOpen((prev) => !prev)}
                  title="More"
                >
                  <span
                    className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-xl transition",
                      moreOpen
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-slate-100 text-slate-700 group-hover:bg-slate-200"
                    )}
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </span>
                  <span className="whitespace-nowrap">More</span>
                </button>

                {moreOpen ? (
                  <div
                    role="menu"
                    className="absolute left-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
                  >
                    <div className="py-2">
                      {moreItems.map((item) => {
                        const active = isActive(pathname, item.href);
                        const Icon = item.icon;
                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            role="menuitem"
                            aria-current={active ? "page" : undefined}
                            className={cn(
                              "flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm font-semibold transition",
                              active
                                ? "bg-emerald-50 text-emerald-900"
                                : "text-slate-800 hover:bg-slate-50"
                            )}
                            onClick={() => setMoreOpen(false)}
                          >
                            <span
                              className={cn(
                                "flex h-9 w-9 items-center justify-center rounded-xl",
                                active
                                  ? "bg-emerald-100 text-emerald-700"
                                  : "bg-slate-100 text-slate-700"
                              )}
                            >
                              <Icon className="h-4 w-4" />
                            </span>
                            <span className="min-w-0 truncate">{item.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </nav>
        </div>

        <div className="mt-6 min-w-0">{children}</div>
      </div>
    </div>
  );
}
