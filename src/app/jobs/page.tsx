import { Suspense } from "react";
import type { Metadata } from "next";

import JobsBoard from "@/app/jobs/jobs-board";

export const metadata: Metadata = {
  title: "Job openings",
  description: "Browse open positions.",
};

function JobsPageFallback() {
  return (
    <div className="min-h-screen bg-[#faf7f2] px-4 py-16 text-slate-900 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-500">Loading jobs…</p>
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
