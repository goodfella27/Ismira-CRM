"use client";

import JobCompaniesAdmin from "@/components/job-companies-admin";

export default function BreezyCompaniesPage() {
  return (
    <div className="mx-auto w-full">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
            Companies
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Manage company names, logos, ship type, and benefits used on the public jobs board.
          </p>
        </div>
      </div>

      <JobCompaniesAdmin />
    </div>
  );
}
