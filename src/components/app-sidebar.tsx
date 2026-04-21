"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  CalendarDays,
  ClipboardList,
  KanbanSquare,
  LogOut,
  UserCircle,
  Users2,
  Building2,
  Briefcase,
} from "lucide-react";

import ismiraLogo from "@/images/ismira_logo.png";
import { cn } from "@/lib/utils";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { getCompanyBranding } from "@/lib/company-branding-client";
import { TaskNotificationBell } from "@/components/task-notification-bell";

const navItems = [
  {
    label: "Leads",
    href: "/leads",
    description: "Mailing list intake",
    icon: Users2,
  },
  {
    label: "Breezy HR",
    href: "/breezy",
    description: "ATS connection",
    icon: Briefcase,
  },
  {
    label: "Companies",
    href: "/companies",
    description: "Company records",
    icon: Building2,
  },
  {
    label: "Pipeline",
    href: "/pipeline",
    description: "Candidate stages",
    icon: KanbanSquare,
  },
  {
    label: "Calendar",
    href: "/calendar",
    description: "Interview schedule",
    icon: CalendarDays,
  },
  {
    label: "Intake",
    href: "/intake",
    description: "Profile review",
    icon: ClipboardList,
  },
  {
    label: "Company",
    href: "/company",
    description: "Settings of the Company",
    icon: Building2,
  },
];

function isActiveRoute(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [brandTitle, setBrandTitle] = useState("ISMIRA CRM");
  const [brandLogoUrl, setBrandLogoUrl] = useState<string | null>(null);
  const [profileName, setProfileName] = useState("Profile");
  const [profileInitials, setProfileInitials] = useState("IS");
  const [profileAvatarUrl, setProfileAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    const loadBranding = async () => {
      try {
        const branding = await getCompanyBranding();
        if (ignore) return;
        setBrandTitle(branding.title || "ISMIRA CRM");
        setBrandLogoUrl(branding.logoUrl ?? null);
      } catch {
        // ignore
      }
    };
    const onBrandingUpdated = () => {
      loadBranding();
    };
    const loadUser = async () => {
      try {
        const { data } = await supabase.auth.getUser();
        if (!data?.user || ignore) return;
        const metadata = data.user.user_metadata as Record<string, unknown> | null;
        const first =
          typeof metadata?.first_name === "string" ? metadata.first_name.trim() : "";
        const last =
          typeof metadata?.last_name === "string" ? metadata.last_name.trim() : "";
        const full = [first, last].filter(Boolean).join(" ").trim();
        const name =
          full ||
          (typeof metadata?.full_name === "string" && metadata.full_name.trim()) ||
          data.user.email ||
          "Profile";
        const initials =
          full
            .split(" ")
            .filter(Boolean)
            .slice(0, 2)
            .map((part) => part[0]?.toUpperCase())
            .join("") || "IS";
        setProfileName(name);
        setProfileInitials(initials);
        const avatarPath =
          typeof metadata?.avatar_path === "string" ? metadata.avatar_path : null;
        if (avatarPath) {
          const res = await fetch(
            `/api/storage/sign?bucket=candidate-documents&path=${encodeURIComponent(
              avatarPath
            )}`,
            { cache: "no-store" }
          );
          const data = await res.json().catch(() => null);
          if (res.ok && data?.url) {
            setProfileAvatarUrl(data.url);
          }
        }
      } catch {
        // ignore
      }
    };
    loadBranding();
    loadUser();
    window.addEventListener("company-branding-updated", onBrandingUpdated);
    return () => {
      ignore = true;
      window.removeEventListener("company-branding-updated", onBrandingUpdated);
    };
  }, [supabase]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <aside className="relative hidden h-screen w-72 shrink-0 flex-col border-r border-white/10 bg-slate-950 text-slate-100 md:sticky md:top-0 md:flex">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(16,185,129,0.25),transparent_55%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-25 [background-image:radial-gradient(rgba(255,255,255,0.2)_0.5px,transparent_0.5px)] [background-size:14px_14px]" />
      <div className="relative z-10 flex h-full flex-col">
        <div className="flex items-center gap-3 px-6 pb-6 pt-8">
          <div className="flex h-12 w-12 items-center justify-center">
            {brandLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={brandLogoUrl}
                alt={brandTitle}
                className="h-10 w-auto object-contain brightness-0 invert"
              />
            ) : (
              <Image
                src={ismiraLogo}
                alt="Ismira"
                className="h-10 w-auto brightness-0 invert"
                priority
              />
            )}
          </div>
          <div>
            <div className="text-sm font-semibold tracking-wide text-white">
              {brandTitle}
            </div>
            <div className="text-xs text-slate-300">Talent operations</div>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-2 px-4">
          {navItems.map((item) => {
            const active = isActiveRoute(pathname, item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "group relative overflow-hidden rounded-2xl border border-transparent px-4 py-3 text-sm transition",
                  "hover:border-white/20 hover:bg-white/10",
                  active
                    ? "border-emerald-400/40 bg-white/10 text-white shadow-[0_10px_30px_-20px_rgba(16,185,129,0.6)]"
                    : "text-slate-200"
                )}
              >
                <span
                  className={cn(
                    "absolute left-0 top-1/2 h-8 w-1 -translate-y-1/2 rounded-r-full bg-emerald-400/90 transition-opacity",
                    active ? "opacity-100" : "opacity-0"
                  )}
                />
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-slate-100 transition",
                      active
                        ? "bg-emerald-400/20 text-emerald-200"
                        : "group-hover:bg-white/20"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <div>
                    <div className="font-semibold tracking-wide">{item.label}</div>
                    <div className="text-xs text-slate-300">{item.description}</div>
                  </div>
                </div>
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto px-6 pb-6 pt-6">
          <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-white/10 text-sm font-semibold text-white">
                {profileAvatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={profileAvatarUrl}
                    alt={profileName}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  profileInitials
                )}
              </div>
              <div>
                <div className="text-sm font-semibold text-white">
                  {profileName}
                </div>
                <div className="text-xs text-slate-300">View account</div>
              </div>
            </div>
            <div className="mt-3 grid gap-2">
              <Link
                href="/profile"
                className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/20"
              >
                <UserCircle className="h-4 w-4" />
                Profile
              </Link>
              <button
                type="button"
                className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/10"
                onClick={handleLogout}
              >
                <LogOut className="h-4 w-4" />
                Logout
              </button>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

export function MobileTopNav() {
  const pathname = usePathname();
  const [brandTitle, setBrandTitle] = useState("ISMIRA CRM");
  const [brandLogoUrl, setBrandLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    const run = async () => {
      try {
        const branding = await getCompanyBranding();
        if (ignore) return;
        setBrandTitle(branding.title || "ISMIRA CRM");
        setBrandLogoUrl(branding.logoUrl ?? null);
      } catch {
        // ignore
      }
    };
    const onBrandingUpdated = () => {
      run();
    };
    run();
    window.addEventListener("company-branding-updated", onBrandingUpdated);
    return () => {
      ignore = true;
      window.removeEventListener("company-branding-updated", onBrandingUpdated);
    };
  }, []);

  return (
    <div className="border-b border-slate-200 bg-white/90 backdrop-blur md:hidden">
      <div className="flex items-center justify-between px-4 pb-2 pt-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-950">
            {brandLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={brandLogoUrl}
                alt={brandTitle}
                className="h-6 w-auto object-contain invert"
              />
            ) : (
              <Image
                src={ismiraLogo}
                alt="Ismira"
                className="h-6 w-auto invert"
                priority
              />
            )}
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-900">{brandTitle}</div>
            <div className="text-xs text-slate-500">Talent operations</div>
          </div>
        </div>
        <TaskNotificationBell />
      </div>
      <nav className="flex items-center gap-2 overflow-x-auto px-4 pb-4 text-xs">
        {navItems.map((item) => {
          const active = isActiveRoute(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "whitespace-nowrap rounded-full border px-3 py-1.5 font-semibold transition",
                active
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-slate-200 text-slate-600 hover:bg-slate-100"
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
