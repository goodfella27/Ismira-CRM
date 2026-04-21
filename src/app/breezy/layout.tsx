import type { ReactNode } from "react";

import BreezyShell from "@/app/breezy/shell";

export default function BreezyLayout({ children }: { children: ReactNode }) {
  return <BreezyShell>{children}</BreezyShell>;
}

