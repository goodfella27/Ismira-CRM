"use client";
import { isPublicUiRoute } from "@/lib/theme";

import { ReactNode, useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import { WorkspaceDataProvider } from "@/components/workspace-data-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { AppSidebar, MobileTopNav } from "@/components/app-sidebar";
import { ChatWidget } from "@/components/chat-widget";
import { TaskNotificationBell } from "@/components/task-notification-bell";
import { BrandingTitleSync } from "@/components/branding-title-sync";
import { AppDialogsProvider } from "@/components/app-dialogs";
import { createSupabaseBrowserClient, hasSupabaseBrowserEnv } from "@/lib/supabase/client";
import { isPublicShellRoute } from "@/lib/public-shell-routes";

const CHAT_DISABLED_ROUTES = ["/breezy", "/design-system"];

function SupabaseConfigNotice() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-16 text-foreground">
      <div className="w-full max-w-2xl rounded-panel border border-border bg-card p-8 shadow-control">
        <BrandingTitleSync fallbackTitle="LinAs CRM" />
        <div className="text-xs font-semibold uppercase tracking-[0.22em] text-warning">
          Configuration required
        </div>
        <h1 className="mt-3 text-3xl font-semibold text-foreground">
          Supabase environment variables are missing
        </h1>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">
          This deployment is running without the required Vercel environment variables, so
          authenticated CRM features cannot start.
        </p>
        <div className="mt-6 rounded-panel border border-border bg-muted p-4 text-sm text-foreground">
          <div>`NEXT_PUBLIC_SUPABASE_URL`</div>
          <div className="mt-2">`NEXT_PUBLIC_SUPABASE_ANON_KEY`</div>
          <div className="mt-2">`SUPABASE_SERVICE_ROLE_KEY`</div>
        </div>
        <p className="mt-6 text-sm text-muted-foreground">
          Add them in Vercel Project Settings → Environment Variables, then redeploy the latest
          commit.
        </p>
      </div>
    </main>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [isAdmin, setIsAdmin] = useState(false);
  const publicShellRoute = isPublicShellRoute(pathname);
  const isChatDisabledRoute = CHAT_DISABLED_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );
  const hasSupabaseEnv = hasSupabaseBrowserEnv();

  useEffect(() => {
    if (publicShellRoute || !hasSupabaseEnv) return;
    let controller: AbortController | null = null;
    const refreshAccess = () => {
      controller?.abort();
      const next = new AbortController();
      controller = next;
      void fetch("/api/auth/access", { cache: "no-store", signal: next.signal })
        .then(response => response.json())
        .then(data => { if (!next.signal.aborted) setIsAdmin(data?.isAdmin === true); })
        .catch(() => { if (!next.signal.aborted) setIsAdmin(false); });
    };
    refreshAccess();
    const { data } = createSupabaseBrowserClient().auth.onAuthStateChange(event => {
      if (event === "INITIAL_SESSION") return;
      controller?.abort();
      setIsAdmin(false);
      if (event !== "SIGNED_OUT") refreshAccess();
    });
    return () => { controller?.abort(); data.subscription.unsubscribe(); };
  }, [publicShellRoute, hasSupabaseEnv]);

  if (!hasSupabaseEnv) {
    return <SupabaseConfigNotice />;
  }

  if (publicShellRoute) {
    return (
      <AppDialogsProvider>
        <main data-public-ui={isPublicUiRoute(pathname) ? "" : undefined} className="min-h-screen bg-transparent">
          <BrandingTitleSync fallbackTitle="LinAs CRM" />
          {children}
        </main>
      </AppDialogsProvider>
    );
  }

  return (
    <WorkspaceDataProvider isAdmin={isAdmin}><AppDialogsProvider>
      <div className="flex min-h-screen w-full bg-background text-foreground">
        <BrandingTitleSync fallbackTitle="Ismira CRM" />
        <AppSidebar isAdmin={isAdmin} />
        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          <MobileTopNav key={pathname} isAdmin={isAdmin} />
          <header className="hidden h-16 shrink-0 items-center justify-between border-b border-border px-8 md:flex">
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><span>Workspace</span><span className="text-border">/</span><span className="capitalize text-foreground">{pathname.split("/").filter(Boolean).at(-1)?.replaceAll("-", " ") || "Overview"}</span></div>
            <div className="flex items-center gap-2"><ThemeToggle/><TaskNotificationBell/></div>
          </header>
          <main className="min-w-0 flex-1">{children}</main>
        </div>
        {!isChatDisabledRoute ? <ChatWidget /> : null}
      </div>
    </AppDialogsProvider></WorkspaceDataProvider>
  );
}
