import Image from "next/image";
import Link from "next/link";
import { ArrowRight, LogIn } from "lucide-react";

import ismiraLogo from "@/images/ismira_logo.png";

export default function NotFound() {
  return (
    <div className="flex min-h-svh flex-col bg-[#f7fafb] text-zinc-900">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 border-b border-zinc-200 px-6 py-6 sm:px-10">
        <Link href="/" className="flex items-center gap-3 rounded focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-600">
          <Image src={ismiraLogo} alt="Ismira" className="h-12 w-auto" priority />
          <span className="text-sm font-semibold sm:text-base">Ismira Jobs Portal</span>
        </Link>
        <Link href="/admin" className="inline-flex min-h-11 shrink-0 items-center gap-2 text-sm font-medium text-zinc-600 transition-colors hover:text-sky-700 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-600">
          <LogIn className="size-4" aria-hidden="true" />
          Log in
        </Link>
      </header>

      <section aria-labelledby="not-found-title" className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center px-6 py-16 text-center sm:py-20">
        <p className="select-none text-[112px] font-bold leading-none text-sky-700 sm:text-[160px]">404</p>
        <div className="mb-8 mt-6 h-1 w-12 bg-amber-400" aria-hidden="true" />
        <h1 id="not-found-title" className="text-3xl font-semibold leading-tight sm:text-4xl">This page is off the map.</h1>
        <p className="mt-4 max-w-sm text-base leading-7 text-zinc-600">
          The link may be outdated or the page has moved. Your next opportunity is still out there.
        </p>
        <Link href="/" className="group mt-8 inline-flex min-h-12 items-center justify-center gap-3 rounded-lg bg-sky-700 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-sky-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-600">
          Browse jobs
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-1 motion-reduce:transform-none" aria-hidden="true" />
        </Link>
      </section>

      <footer className="mx-auto w-full max-w-6xl border-t border-zinc-200 px-6 py-6 text-center text-xs text-zinc-500 sm:px-10">
        Ismira · Cruise, hospitality &amp; international careers
      </footer>
    </div>
  );
}
