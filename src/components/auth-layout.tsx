"use client";

import Image from "next/image";
import ismiraLogo from "@/images/ismira_logo.png";
import loginBackground from "@/images/login_page.jpg";
import profileOne from "@/images/profile/profile_one.jpg";
import profileTwo from "@/images/profile/profile_two.jpg";
import profileThree from "@/images/profile/profile_three.jpg";
import { useEffect, useState } from "react";
import { getCompanyBranding } from "@/lib/company-branding-client";

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
    <div className="relative min-h-screen bg-[#c9f7db] p-4 md:p-6">
      <div className="relative z-10 flex min-h-[calc(100vh-2rem)] flex-col gap-6 md:min-h-[calc(100vh-3rem)] md:flex-row">
        <div className="flex flex-1 items-center justify-center rounded-[32px] border border-white/70 bg-white px-6 py-12 shadow-[0_22px_60px_-45px_rgba(16,185,129,0.45)] md:px-12 md:py-10">
          <div className="w-full max-w-sm">
            <div className="mb-6 flex items-center gap-3">
              {brandLogoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={brandLogoUrl}
                  alt={brandTitle}
                  className="h-12 w-auto object-contain"
                />
              ) : (
                <Image src={ismiraLogo} alt="Ismira" className="h-12 w-auto" />
              )}
            </div>
            <h1 className="mt-3 text-3xl font-semibold text-slate-900">
              {title}
            </h1>
            <p className="mt-2 text-sm text-slate-500">{subtitle}</p>

            <div className="mt-8 space-y-4">{children}</div>

            <p className="mt-6 text-xs text-slate-400">
              By continuing, you agree to Ismira&apos;s Terms of Service and Privacy
              Policy.
            </p>
          </div>
        </div>

        <div
          className="relative flex flex-1 flex-col overflow-hidden rounded-[32px] bg-emerald-600 bg-cover bg-center p-10 text-white shadow-[0_22px_60px_-45px_rgba(16,185,129,0.45)]"
          style={{ backgroundImage: `url(${loginBackground.src})` }}
        >
          <div className="absolute inset-0 opacity-20 [background-image:radial-gradient(rgba(255,255,255,0.35)_1px,transparent_1px)] [background-size:24px_24px]" />
          <div className="relative z-10 flex flex-1 flex-col items-center justify-start pt-12 text-center md:pt-14">
            <div className="mb-4 rounded-full bg-white/10 px-4 py-1 text-xs font-semibold uppercase tracking-[0.35em] text-white/80">
              {brandTitle}
            </div>
            <div className="text-4xl font-semibold leading-tight md:text-5xl">
              Welcome back to your
              <span className="block text-emerald-100">talent workspace.</span>
            </div>
            <p className="mt-4 max-w-md text-sm text-emerald-100/90">
              Manage pipelines, capture transcripts, and keep every candidate moving
              with clarity.
            </p>
          </div>
          <div className="relative z-10 mt-10 rounded-[24px] border border-white/20 bg-white/10 p-6 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.6)] backdrop-blur-md">
            <div className="flex items-center justify-between gap-6">
              <div className="flex flex-1 items-center gap-4">
                <div className="flex flex-col">
                  <div className="text-2xl font-semibold">Pipeline ready</div>
                  <div className="mt-1 text-sm text-emerald-100/80">
                    24 candidates awaiting review
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-xs text-emerald-100/80">+18 more</div>
                <div className="h-10 w-10 overflow-hidden rounded-full bg-white/20">
                  <Image
                    src={profileOne}
                    alt="Candidate profile"
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="h-10 w-10 overflow-hidden rounded-full bg-white/20">
                  <Image
                    src={profileTwo}
                    alt="Candidate profile"
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="h-10 w-10 overflow-hidden rounded-full bg-white/20">
                  <Image
                    src={profileThree}
                    alt="Candidate profile"
                    className="h-full w-full object-cover"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
