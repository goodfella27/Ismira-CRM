/* eslint-disable @next/next/no-img-element */
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
  Menu,
  Palette,
} from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Dialog, DialogTrigger, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ThemeToggle } from "@/components/theme-toggle";
import ismiraLogo from "@/images/ismira_logo.png";
import { cn } from "@/lib/utils";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  getCompanyBranding,
  invalidateCompanyBrandingCache,
} from "@/lib/company-branding-client";
import { TaskNotificationBell } from "@/components/task-notification-bell";

const navItems = [
  { label: "Design system", href: "/design-system", description: "UI reference", icon: Palette },
  {
    label: "Leads",
    href: "/leads",
    description: "Mailing list intake",
    icon: Users2,
  },
  {
    label: "Ismira HR Portal",
    href: "/breezy",
    description: "Recruitment workspace",
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

export function AppSidebar({ isAdmin }: { isAdmin: boolean }) {
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
      invalidateCompanyBrandingCache();
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
    router.push("/admin");
  };

  return (
    <aside className="sticky top-0 hidden h-svh w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex">
      <Link href="/breezy" className="flex h-16 shrink-0 items-center gap-3 border-b border-sidebar-border px-5">
        {brandLogoUrl ? <img src={brandLogoUrl} alt="" className="h-8 w-8 object-contain" /> : <Image src={ismiraLogo} alt="" className="h-8 w-8 object-contain" priority />}
        <span className="truncate text-sm font-semibold tracking-tight">{brandTitle}</span>
      </Link>
      <div className="px-5 pb-2 pt-6 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Workspace</div>
      <nav aria-label="Main navigation" className="flex-1 space-y-1 overflow-y-auto px-3 py-1">
        {navItems.filter(item => isAdmin || !["/company", "/design-system"].includes(item.href)).map(item => {
          const active = isActiveRoute(pathname,item.href); const Icon=item.icon;
          return <Link key={item.href} href={item.href} aria-current={active?"page":undefined} className={cn("flex h-9 items-center gap-3 rounded-md px-3 text-sm transition-colors",active?"bg-sidebar-accent font-medium text-sidebar-accent-foreground":"text-muted-foreground hover:bg-sidebar-accent/70 hover:text-foreground")}><Icon size={16}/>{item.label}</Link>;
        })}
      </nav>
      <div className="border-t border-sidebar-border p-3">
        <Link href="/profile" className="flex min-w-0 items-center gap-3 rounded-md p-2 hover:bg-sidebar-accent"><Avatar>{profileAvatarUrl ? <img src={profileAvatarUrl} alt=""/> : profileInitials}</Avatar><span className="min-w-0"><span className="block truncate text-sm font-medium">{profileName}</span><span className="block text-xs text-muted-foreground">Your account</span></span></Link>
        <Button variant="ghost" className="mt-1 w-full justify-start" onClick={handleLogout}><LogOut/>Sign out</Button>
      </div>
    </aside>
  );
}

export function MobileTopNav({ isAdmin }: { isAdmin: boolean }) {
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
    <div className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-border bg-background px-4 md:hidden">
      <Dialog>
        <DialogTrigger asChild><Button variant="ghost" size="icon" aria-label="Open navigation"><Menu/></Button></DialogTrigger>
        <DialogContent className="left-0 top-0 h-svh max-h-svh w-72 translate-x-0 translate-y-0 rounded-none p-4" aria-describedby={undefined}>
          <DialogTitle className="mb-6 text-base font-semibold">{brandTitle}</DialogTitle>
          <nav aria-label="Mobile navigation" className="space-y-1">{navItems.filter(item=>isAdmin||!["/company","/design-system"].includes(item.href)).map(item=><Link key={item.href} href={item.href} aria-current={isActiveRoute(pathname,item.href)?"page":undefined} className={cn(buttonVariants({variant:"ghost"}),"flex w-full justify-start",isActiveRoute(pathname,item.href)&&"bg-accent text-foreground")}><item.icon/>{item.label}</Link>)}<Link href="/profile" className={cn(buttonVariants({variant:"ghost"}),"flex justify-start")}><UserCircle/>Profile</Link></nav>
        </DialogContent>
      </Dialog>
      <div className="flex min-w-0 items-center gap-2">{brandLogoUrl?<img src={brandLogoUrl} alt="" className="size-7 object-contain"/>:<Image src={ismiraLogo} alt="" className="size-7 object-contain"/>}<span className="truncate font-semibold">{brandTitle}</span></div>
      <div className="flex items-center"><ThemeToggle/><TaskNotificationBell/></div>
    </div>
  );
}
