"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  AlignJustify,
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
  {
    label: "Application routing",
    href: "/breezy/application-routing",
    icon: Workflow,
    description: "Application communication groups",
  },
  {
    label: "Applications",
    href: "/breezy/applications",
    icon: ClipboardList,
    description: "Applications saved in this CRM",
  },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function BreezyShell({
  children,
  isAdmin = false,
}: {
  children: ReactNode;
  isAdmin?: boolean;
}) {
  const pathname = usePathname();
  const visibleItems = items.filter(
    (item) =>
      isAdmin ||
      !["/breezy/applications", "/breezy/application-routing"].includes(
        item.href,
      ),
  );
  const primaryItems = [
    items[1],
    items[11],
    items[0],
    items[4],
    items[5],
    items[6],
    items[10],
  ].filter((item) => visibleItems.includes(item));
  const moreItems = visibleItems.filter((item) => !primaryItems.includes(item));
  return (
    <div className="px-4 py-5 sm:px-6 lg:px-8">
      <nav
        aria-label="HR portal"
        className="mb-8 flex items-center gap-1 border-b border-border pb-3"
      >
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {primaryItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(pathname, item.href) ? "page" : undefined}
              className={cn(
                "inline-flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-md px-3 text-sm transition-colors",
                isActive(pathname, item.href)
                  ? "bg-accent font-medium text-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <item.icon size={15} />
              {item.label}
            </Link>
          ))}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label="More HR portal pages"
            >
              <AlignJustify />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {moreItems.map((item) => (
              <DropdownMenuItem key={item.href} asChild>
                <Link
                  href={item.href}
                  aria-current={
                    isActive(pathname, item.href) ? "page" : undefined
                  }
                >
                  <item.icon />
                  {item.label}
                </Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </nav>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
