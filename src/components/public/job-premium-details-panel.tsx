import {
  BadgeDollarSign,
  BedDouble,
  CalendarDays,
  ChevronsUp,
  Coins,
  FileText,
  Gift,
  LockKeyhole,
  NotebookText,
  ShieldCheck,
  StickyNote,
} from "lucide-react";

import {
  CABIN_TYPE_LABELS,
  POSITION_COMPENSATION_LABELS,
  type JobPremiumDetails,
} from "@/lib/job-premium-details";

export function JobPremiumDetailsPanel({ details }: { details: JobPremiumDetails }) {
  const hasCompensationDetails = Boolean(
    details.salaryText || details.tipsText || details.positionCompensationType,
  );
  const hasContractDetails = Boolean(details.contractLength || details.stripes || details.cabinType);

  return (
    <section
      aria-label="Member details"
      className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_18px_50px_-38px_rgba(15,23,42,0.45)]"
    >
      <div className="relative isolate overflow-hidden bg-gradient-to-r from-amber-300 via-orange-400 to-fuchsia-400 px-5 py-5 text-slate-950 sm:px-6">
        <div
          className="pointer-events-none absolute -right-10 -top-20 -z-10 h-44 w-44 rounded-full bg-white/20 blur-3xl"
          aria-hidden="true"
        />
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3.5">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/35 text-slate-950 ring-1 ring-inset ring-white/50 shadow-sm backdrop-blur-sm">
              <LockKeyhole className="h-4.5 w-4.5" aria-hidden="true" />
            </span>
            <div>
              <h3 className="text-sm font-bold tracking-tight">Member details</h3>
              <p className="mt-0.5 text-xs leading-5 text-slate-900/75">
                Private information — never shown on the public job listing
              </p>
            </div>
          </div>
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-white/50 bg-white/30 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-950 shadow-sm backdrop-blur-sm">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            Member only
          </span>
        </div>
      </div>

      <div className="p-5 sm:p-6">
        <div className="grid gap-x-10 gap-y-7 md:grid-cols-2">
          {hasCompensationDetails ? (
            <div>
              <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                <Coins className="h-4 w-4 text-orange-500" aria-hidden="true" />
                Compensation
              </div>
              <dl className="divide-y divide-slate-100 border-y border-slate-100">
                {details.salaryText ? (
                  <div className="flex items-start justify-between gap-5 py-3 transition-colors hover:bg-orange-50/60">
                    <dt className="flex items-center gap-2 text-sm text-slate-500">
                      <BadgeDollarSign className="h-4 w-4 shrink-0 text-orange-500" aria-hidden="true" />
                      Salary
                    </dt>
                    <dd className="max-w-[60%] text-right text-sm font-bold text-slate-950">{details.salaryText}</dd>
                  </div>
                ) : null}
                {details.tipsText ? (
                  <div className="flex items-start justify-between gap-5 py-3 transition-colors hover:bg-orange-50/60">
                    <dt className="flex items-center gap-2 text-sm text-slate-500">
                      <Gift className="h-4 w-4 shrink-0 text-orange-500" aria-hidden="true" />
                      Gratuities / bonuses
                    </dt>
                    <dd className="max-w-[60%] text-right text-sm font-semibold text-slate-900">{details.tipsText}</dd>
                  </div>
                ) : null}
                {details.positionCompensationType ? (
                  <div className="flex items-start justify-between gap-5 py-3 transition-colors hover:bg-orange-50/60">
                    <dt className="flex items-center gap-2 text-sm text-slate-500">
                      <Coins className="h-4 w-4 shrink-0 text-orange-500" aria-hidden="true" />
                      Compensation type
                    </dt>
                    <dd className="max-w-[60%] text-right text-sm font-semibold text-slate-900">
                      {POSITION_COMPENSATION_LABELS[details.positionCompensationType]}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </div>
          ) : null}

          {hasContractDetails ? (
            <div>
              <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                <FileText className="h-4 w-4 text-pink-500" aria-hidden="true" />
                Role &amp; contract
              </div>
              <dl className="divide-y divide-slate-100 border-y border-slate-100">
                {details.contractLength ? (
                  <div className="flex items-start justify-between gap-5 py-3 transition-colors hover:bg-pink-50/60">
                    <dt className="flex items-center gap-2 text-sm text-slate-500">
                      <CalendarDays className="h-4 w-4 shrink-0 text-pink-500" aria-hidden="true" />
                      Contract length
                    </dt>
                    <dd className="max-w-[60%] text-right text-sm font-semibold text-slate-900">{details.contractLength}</dd>
                  </div>
                ) : null}
                {details.stripes ? (
                  <div className="flex items-start justify-between gap-5 py-3 transition-colors hover:bg-pink-50/60">
                    <dt className="flex items-center gap-2 text-sm text-slate-500">
                      <ChevronsUp className="h-4 w-4 shrink-0 text-pink-500" aria-hidden="true" />
                      Rank
                    </dt>
                    <dd className="max-w-[60%] text-right text-sm font-semibold text-slate-900">
                      {details.stripes} {details.stripes === "1" ? "stripe" : "stripes"}
                    </dd>
                  </div>
                ) : null}
                {details.cabinType ? (
                  <div className="flex items-start justify-between gap-5 py-3 transition-colors hover:bg-pink-50/60">
                    <dt className="flex items-center gap-2 text-sm text-slate-500">
                      <BedDouble className="h-4 w-4 shrink-0 text-pink-500" aria-hidden="true" />
                      Cabin
                    </dt>
                    <dd className="max-w-[60%] text-right text-sm font-semibold text-slate-900">
                      {CABIN_TYPE_LABELS[details.cabinType]}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </div>
          ) : null}
        </div>

        {details.salaryNote || details.additionalInfo ? (
          <div className="mt-6 grid gap-5 border-t border-slate-200 pt-5 md:grid-cols-2">
            {details.salaryNote ? (
              <div>
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                  <StickyNote className="h-3.5 w-3.5 text-orange-500" aria-hidden="true" />
                  Salary note
                </div>
                <p className="mt-1.5 text-sm font-medium leading-6 text-slate-800">{details.salaryNote}</p>
              </div>
            ) : null}
            {details.additionalInfo ? (
              <div className={details.salaryNote ? "md:border-l md:border-slate-200 md:pl-5" : "md:col-span-2"}>
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                  <NotebookText className="h-3.5 w-3.5 text-pink-500" aria-hidden="true" />
                  Additional details
                </div>
                <p className="mt-1.5 whitespace-pre-wrap text-sm leading-6 text-slate-700">{details.additionalInfo}</p>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
