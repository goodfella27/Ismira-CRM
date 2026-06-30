"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Crown, Facebook, Instagram, LayoutDashboard, Linkedin, LogIn, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";

import ismiraLogo from "@/images/ismira_logo.png";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const LINKS = {
  website: "https://ismira.lt",
  facebook: "https://www.facebook.com/",
  instagram: "https://www.instagram.com/",
  linkedin: "https://www.linkedin.com/",
} as const;

export default function StickyJobsHeader() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [access, setAccess] = useState<{
    authenticated: boolean;
    isAdmin: boolean;
    role: "Visitor" | "Member Basic" | "Member Premium" | "Admin";
    canAccessHrPortal: boolean;
  } | null>(null);

  useEffect(() => {
    let ignore = false;
    void fetch("/api/auth/access", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (ignore || !data || typeof data !== "object") return;
        setAccess({
          authenticated: data.authenticated === true,
          isAdmin: data.isAdmin === true,
          role:
            data.role === "Admin" ||
            data.role === "Member Premium" ||
            data.role === "Member Basic"
              ? data.role
              : "Visitor",
          canAccessHrPortal: data.canAccessHrPortal === true,
        });
      })
      .catch(() => {
        if (!ignore) {
          setAccess({
            authenticated: false,
            isAdmin: false,
            role: "Visitor",
            canAccessHrPortal: false,
          });
        }
      });
    return () => {
      ignore = true;
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setAccess({
      authenticated: false,
      isAdmin: false,
      role: "Visitor",
      canAccessHrPortal: false,
    });
    router.refresh();
  };

  return (
    <header className="fixed inset-x-0 top-2 z-50 flex justify-center px-2.5 sm:top-4 sm:px-5 lg:px-8">
      <div
        className={[
          "pointer-events-auto w-[calc(100vw-1.25rem)] max-w-[1280px] xl:w-full",
          "rounded-[999px] border border-white/40 bg-white/35",
          "shadow-[0_18px_60px_-30px_rgba(15,23,42,0.45)]",
          "backdrop-blur-xl",
          "ring-1 ring-slate-200/60",
        ].join(" ")}
      >
        <div className="flex items-center justify-between gap-2 px-3 py-2 sm:gap-4 sm:px-6 sm:py-3">
          <Link href="/jobs" className="flex items-center gap-3">
            <Image src={ismiraLogo} alt="Logo" className="h-7 w-auto sm:h-9" priority={false} />
          </Link>

          <div className="flex min-w-0 items-center gap-1 sm:gap-3">
            {access === null ? (
              <span
                className="h-9 w-20 animate-pulse rounded-full border border-white/50 bg-white/40 sm:h-10"
                aria-hidden="true"
              />
            ) : !access.authenticated ? (
              <Link
                href="/login?next=%2Fjobs"
                className="inline-flex h-9 items-center gap-2 rounded-full border border-slate-200 bg-white/70 px-3 text-xs font-semibold text-slate-800 transition hover:bg-white sm:h-10 sm:px-4"
              >
                <LogIn className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">Log in</span>
              </Link>
            ) : access.canAccessHrPortal ? (
              <Link
                href="/pipeline"
                className="inline-flex h-9 items-center gap-2 rounded-full bg-slate-950 px-3 text-xs font-semibold text-white transition hover:bg-slate-800 sm:h-10 sm:px-4"
              >
                <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">
                  {access.isAdmin ? "Admin" : "HR Portal"}
                </span>
              </Link>
            ) : (
              <div className="flex items-center gap-1">
                <span className="inline-flex h-9 items-center gap-1.5 rounded-full border border-slate-200 bg-white/70 px-3 text-[11px] font-bold uppercase tracking-wide text-slate-700 sm:h-10">
                  {access.role !== "Visitor" ? (
                    <Crown className="h-3.5 w-3.5 text-amber-600" />
                  ) : null}
                  {access.role}
                </span>
                <button
                  type="button"
                  aria-label="Log out"
                  onClick={() => void signOut()}
                  className="grid h-9 w-9 place-items-center rounded-full text-slate-600 transition hover:bg-white/70 hover:text-slate-950 sm:h-10 sm:w-10"
                >
                  <LogOut className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            )}

            <a
              href={LINKS.website}
              target="_blank"
              rel="noreferrer"
              className={[
                "inline-flex items-center justify-center rounded-full",
                "bg-gradient-to-r from-[#ff9f2f] to-[#ffbf5f] px-3 py-2 text-xs font-semibold text-white sm:px-5 sm:text-sm",
                "shadow-[0_12px_24px_-16px_rgba(255,159,47,0.78)]",
                "transition hover:from-[#ff8f14] hover:to-[#ffb23a]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400/50",
              ].join(" ")}
            >
              <span className="sm:hidden">Website</span>
              <span className="hidden sm:inline">Company Website</span>
            </a>

            <div className="flex items-center gap-0.5 sm:gap-1.5">
              <a
                href={LINKS.facebook}
                target="_blank"
                rel="noreferrer"
                aria-label="Facebook"
                className="grid h-8 w-8 place-items-center rounded-full text-slate-700 transition hover:bg-white/50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 sm:h-10 sm:w-10"
              >
                <Facebook className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </a>
              <a
                href={LINKS.instagram}
                target="_blank"
                rel="noreferrer"
                aria-label="Instagram"
                className="grid h-8 w-8 place-items-center rounded-full text-slate-700 transition hover:bg-white/50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 sm:h-10 sm:w-10"
              >
                <Instagram className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </a>
              <a
                href={LINKS.linkedin}
                target="_blank"
                rel="noreferrer"
                aria-label="LinkedIn"
                className="grid h-8 w-8 place-items-center rounded-full text-slate-700 transition hover:bg-white/50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 sm:h-10 sm:w-10"
              >
                <Linkedin className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
