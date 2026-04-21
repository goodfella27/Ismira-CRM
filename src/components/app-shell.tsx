"use client";

import { ReactNode } from "react";
import { usePathname } from "next/navigation";

import { AppSidebar, MobileTopNav } from "@/components/app-sidebar";
import { ChatWidget } from "@/components/chat-widget";
import { TaskNotificationBell } from "@/components/task-notification-bell";
import { BrandingTitleSync } from "@/components/branding-title-sync";
import { hasSupabaseBrowserEnv } from "@/lib/supabase/client";

const PUBLIC_SHELL_ROUTES = ["/login", "/register", "/auth", "/form", "/cv", "/jobs", "/_not-found"];

function SupabaseConfigNotice() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 py-16 text-slate-100">
      <div className="w-full max-w-2xl rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur">
        <BrandingTitleSync fallbackTitle="LinAs CRM" />
        <div className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-300">
          Configuration required
        </div>
        <h1 className="mt-3 text-3xl font-semibold text-white">
          Supabase environment variables are missing
        </h1>
        <p className="mt-4 text-sm leading-6 text-slate-300">
          This deployment is running without the required Vercel environment variables, so
          authenticated CRM features cannot start.
        </p>
        <div className="mt-6 rounded-2xl border border-white/10 bg-slate-950/50 p-4 text-sm text-slate-200">
          <div>`NEXT_PUBLIC_SUPABASE_URL`</div>
          <div className="mt-2">`NEXT_PUBLIC_SUPABASE_ANON_KEY`</div>
          <div className="mt-2">`SUPABASE_SERVICE_ROLE_KEY`</div>
        </div>
        <p className="mt-6 text-sm text-slate-300">
          Add them in Vercel Project Settings → Environment Variables, then redeploy the latest
          commit.
        </p>
      </div>
    </main>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isPublicShellRoute = PUBLIC_SHELL_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );
  const hasSupabaseEnv = hasSupabaseBrowserEnv();

  if (!hasSupabaseEnv) {
    return <SupabaseConfigNotice />;
  }

  if (isPublicShellRoute) {
    return (
      <main className="min-h-screen bg-transparent">
        <BrandingTitleSync fallbackTitle="LinAs CRM" />
        {children}
      </main>
    );
  }

  return (
    <div className="flex min-h-screen w-full bg-slate-950">
      <BrandingTitleSync fallbackTitle="LinAs CRM" />
      <AppSidebar />
      <div className="flex min-h-screen min-w-0 flex-1 p-4 sm:p-6 lg:p-8">
        <div className="relative flex min-h-full w-full flex-col overflow-hidden rounded-3xl bg-white shadow-[0_20px_60px_-40px_rgba(15,23,42,0.4)] ring-1 ring-slate-200/70">
          <MobileTopNav />
          <div className="absolute right-4 top-4 z-30 hidden md:block">
            <TaskNotificationBell />
          </div>
          <main className="flex-1">{children}</main>
        </div>
      </div>
      <ChatWidget />
    </div>
  );
}
