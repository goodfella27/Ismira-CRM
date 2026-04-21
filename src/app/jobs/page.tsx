import type { Metadata } from "next";

import JobsBoard from "@/app/jobs/jobs-board";

export const metadata: Metadata = {
  title: "Job openings",
  description: "Browse open positions.",
};

export default function JobsPage() {
  return <JobsBoard />;
}

