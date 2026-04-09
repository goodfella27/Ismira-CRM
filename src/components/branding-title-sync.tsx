"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import {
  getCompanyBranding,
  invalidateCompanyBrandingCache,
} from "@/lib/company-branding-client";

export function BrandingTitleSync({ fallbackTitle }: { fallbackTitle: string }) {
  const pathname = usePathname();
  const [title, setTitle] = useState(fallbackTitle);

  useEffect(() => {
    let ignore = false;

    const load = async () => {
      try {
        const branding = await getCompanyBranding();
        if (ignore) return;
        setTitle(branding.title || fallbackTitle);
      } catch {
        if (ignore) return;
        setTitle(fallbackTitle);
      }
    };

    const onBrandingUpdated = () => {
      invalidateCompanyBrandingCache();
      load();
    };

    load();
    window.addEventListener("company-branding-updated", onBrandingUpdated);
    return () => {
      ignore = true;
      window.removeEventListener("company-branding-updated", onBrandingUpdated);
    };
  }, [fallbackTitle]);

  useEffect(() => {
    // Re-apply on route changes because Next can reset document.title on navigation.
    document.title = title || fallbackTitle;
  }, [title, pathname, fallbackTitle]);

  return null;
}

