"use client";

import { ReactNode } from "react";
import { usePathname } from "next/navigation";

import { AppSidebar, MobileTopNav } from "@/components/app-sidebar";
import { ChatWidget } from "@/components/chat-widget";
import { TaskNotificationBell } from "@/components/task-notification-bell";

const AUTH_ROUTES = ["/login", "/register", "/auth", "/form", "/cv", "/jobs"];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isAuthRoute = AUTH_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );

  if (isAuthRoute) {
    return <main className="min-h-screen bg-transparent">{children}</main>;
  }

  return (
    <div className="flex min-h-screen w-full bg-slate-950">
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
