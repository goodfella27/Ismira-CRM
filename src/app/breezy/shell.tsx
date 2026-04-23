"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Briefcase,
  ClipboardList,
  Mail,
  Building2,
  Workflow,
  SlidersHorizontal,
  Webhook,
  FolderKanban,
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

  return (
    <div className="p-6 sm:p-10">
      <div className="w-full max-w-none">
        <div className="flex flex-col gap-6 lg:flex-row">
          <aside className="w-full shrink-0 lg:w-72">
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-600">
                Integration
              </div>
              <div className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
                Breezy HR
              </div>
              <p className="mt-2 text-sm text-slate-600">
                Manage Breezy connection data and sync assets into LinAs CRM.
              </p>

              <nav className="mt-6 grid gap-2">
                {items.map((item) => {
                  const active = isActive(pathname, item.href);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "group flex items-start gap-3 rounded-2xl border px-4 py-3 transition",
                        active
                          ? "border-emerald-200 bg-emerald-50 text-slate-900"
                          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                      )}
                    >
                      <span
                        className={cn(
                          "mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl transition",
                          active
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-slate-100 text-slate-700 group-hover:bg-slate-200"
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold">
                          {item.label}
                        </span>
                        <span className="block text-xs text-slate-500">
                          {item.description}
                        </span>
                      </span>
                    </Link>
                  );
                })}
              </nav>
            </div>
          </aside>

          <div className="min-w-0 flex-1">{children}</div>
        </div>
      </div>
    </div>
  );
}
