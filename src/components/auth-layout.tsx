/* eslint-disable @next/next/no-img-element */
"use client";

import Image from "next/image";
import ismiraLogo from "@/images/ismira_logo.png";
import loginBackground from "@/images/login_page.jpg";
import { ThemeToggle } from "@/components/theme-toggle";
import { useEffect, useState } from "react";
import {
  getCompanyBranding,
  invalidateCompanyBrandingCache,
} from "@/lib/company-branding-client";

export function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
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
      invalidateCompanyBrandingCache();
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
    <div className="grid min-h-svh bg-background text-foreground lg:grid-cols-2">
      <div className="relative flex flex-col px-6 py-6 sm:px-12">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {brandLogoUrl ? (
              <img
                src={brandLogoUrl}
                alt={brandTitle}
                className="h-9 w-auto object-contain"
              />
            ) : (
              <Image src={ismiraLogo} alt="Ismira" className="h-9 w-auto" />
            )}
            <span className="text-sm font-semibold">{brandTitle}</span>
          </div>
          <ThemeToggle />
        </div>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-16">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {subtitle}
          </p>
          <div className="mt-8 space-y-6">{children}</div>
          <p className="mt-8 text-xs leading-5 text-muted-foreground">
            By continuing, you agree to Ismira&apos;s Terms of Service and
            Privacy Policy.
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} Ismira
        </p>
      </div>
      <div className="relative hidden overflow-hidden border-l border-border lg:block">
        <Image
          src={loginBackground}
          alt=""
          fill
          priority
          className="object-cover"
          sizes="50vw"
        />
        <div className="absolute inset-0 bg-black/35" />
        <div className="absolute bottom-12 left-12 right-12 text-white">
          <p className="text-xs uppercase tracking-widest text-white/80">
            {brandTitle}
          </p>
          <p className="mt-4 max-w-md text-3xl font-medium leading-tight">
            Your next chapter starts here.
          </p>
        </div>
      </div>
    </div>
  );
}
