import { Suspense } from "react";
import type { Metadata } from "next";

import JobsBoard from "@/app/jobs/jobs-board";
import {
  JOBS_PORTAL_SHARE_DESCRIPTION,
  JOBS_PORTAL_SHARE_IMAGE,
  JOBS_PORTAL_SHARE_PATH,
  JOBS_PORTAL_SHARE_TITLE,
} from "@/lib/share-metadata";

export const metadata: Metadata = {
  title: JOBS_PORTAL_SHARE_TITLE,
  description: JOBS_PORTAL_SHARE_DESCRIPTION,
  alternates: {
    canonical: JOBS_PORTAL_SHARE_PATH,
  },
  openGraph: {
    title: JOBS_PORTAL_SHARE_TITLE,
    description: JOBS_PORTAL_SHARE_DESCRIPTION,
    url: JOBS_PORTAL_SHARE_PATH,
    siteName: JOBS_PORTAL_SHARE_TITLE,
    images: [JOBS_PORTAL_SHARE_IMAGE],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: JOBS_PORTAL_SHARE_TITLE,
    description: JOBS_PORTAL_SHARE_DESCRIPTION,
    images: [JOBS_PORTAL_SHARE_IMAGE.url],
  },
};

function JobsPageFallback() {
  return (
    <div className="min-h-screen bg-slate-50 px-4 py-16 text-slate-900 sm:px-6">
      <div className="mx-auto grid max-w-6xl gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
        <div className="hidden rounded-3xl border border-slate-200 bg-white p-5 shadow-sm xl:block">
          <div className="h-4 w-16 animate-pulse rounded bg-slate-200" />
          <div className="mt-6 space-y-5">
            {[0, 1, 2, 3].map((item) => (
              <div key={item}>
                <div className="h-3 w-24 animate-pulse rounded bg-slate-200" />
                <div className="mt-3 h-11 animate-pulse rounded-2xl bg-slate-100" />
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[24px] border border-slate-200 bg-white p-3 shadow-sm sm:rounded-3xl sm:p-6">
          <div className="flex items-center justify-between">
            <div className="h-4 w-20 animate-pulse rounded bg-slate-200" />
            <div className="h-8 w-24 animate-pulse rounded-full bg-slate-100 xl:hidden" />
          </div>
          <div className="mt-5 space-y-4">
            {[0, 1, 2].map((item) => (
              <div
                key={item}
                className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm xl:rounded-3xl xl:p-5"
              >
                <div className="animate-pulse xl:flex xl:items-start xl:gap-4">
                  <div className="h-16 w-16 rounded-2xl bg-slate-100 xl:h-20 xl:w-20 xl:rounded-full" />
                  <div className="mt-4 min-w-0 flex-1 xl:mt-0">
                    <div className="h-4 w-24 rounded-full bg-slate-100" />
                    <div className="mt-3 h-5 w-3/4 rounded bg-slate-200" />
                    <div className="mt-4 flex flex-wrap gap-2">
                      <div className="h-8 w-32 rounded-full bg-slate-100" />
                      <div className="h-8 w-28 rounded-full bg-slate-100" />
                      <div className="h-8 w-36 rounded-full bg-slate-100" />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function JobsPage() {
  return (
    <Suspense fallback={<JobsPageFallback />}>
      <JobsBoard />
    </Suspense>
  );
}
