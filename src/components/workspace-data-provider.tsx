"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { createAdminRequestCache } from "@/lib/admin-request-cache";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const CacheContext = createContext<ReturnType<typeof createAdminRequestCache> | null>(null);
const AccessContext = createContext(false);

export function WorkspaceDataProvider({ children, isAdmin }: { children: ReactNode; isAdmin: boolean }) {
  const [cache] = useState(() => createAdminRequestCache());
  useEffect(() => {
    const clearOnReturn = () => { if (document.visibilityState === "visible") cache.clear(); };
    window.addEventListener("focus", clearOnReturn);
    document.addEventListener("visibilitychange", clearOnReturn);
    const client = createSupabaseBrowserClient();
    const { data } = client.auth.onAuthStateChange(() => cache.clear());
    return () => {
      cache.clear();
      data.subscription.unsubscribe();
      window.removeEventListener("focus", clearOnReturn);
      document.removeEventListener("visibilitychange", clearOnReturn);
    };
  }, [cache]);
  return <AccessContext.Provider value={isAdmin}><CacheContext.Provider value={cache}>{children}</CacheContext.Provider></AccessContext.Provider>;
}

export function useWorkspaceRequests() {
  const cache = useContext(CacheContext);
  if (!cache) throw new Error("Workspace requests require WorkspaceDataProvider");
  return cache;
}
export function useWorkspaceAdmin() { return useContext(AccessContext); }
