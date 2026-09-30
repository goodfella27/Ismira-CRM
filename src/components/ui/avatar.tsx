import * as React from "react";
import { cn } from "@/lib/utils";
export function Avatar({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "inline-flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-muted text-xs font-medium [&_img]:size-full [&_img]:object-cover",
        className,
      )}
      {...props}
    />
  );
}
