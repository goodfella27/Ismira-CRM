import Image from "next/image";
import Link from "next/link";
import { Facebook, Instagram, Linkedin } from "lucide-react";

import ismiraLogo from "@/images/ismira_logo.png";

const LINKS = {
  website: "https://ismira.lt",
  facebook: "https://www.facebook.com/",
  instagram: "https://www.instagram.com/",
  linkedin: "https://www.linkedin.com/",
} as const;

export default function StickyJobsHeader() {
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
          <Link href="/" className="flex items-center gap-3">
            <Image src={ismiraLogo} alt="Logo" className="h-7 w-auto sm:h-9" priority={false} />
          </Link>

          <div className="flex min-w-0 items-center gap-1 sm:gap-3">
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
