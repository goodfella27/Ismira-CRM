import * as React from "react";
import { cn } from "@/lib/utils";
export function Toolbar({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 border-b border-border py-3",
        className,
      )}
      {...props}
    />
  );
}
