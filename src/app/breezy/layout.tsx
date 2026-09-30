import type { ReactNode } from "react";

import { getCurrentUserAccess } from "@/lib/auth/access";

import BreezyShell from "@/app/breezy/shell";

export default async function BreezyLayout({ children }: { children: ReactNode }) {
  const access = await getCurrentUserAccess();
  return <BreezyShell isAdmin={access?.isAdmin ?? false}>{children}</BreezyShell>;
}

