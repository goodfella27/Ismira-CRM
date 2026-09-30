import * as React from "react";
import { cn } from "@/lib/utils";
export const controlClass =
  "w-full min-w-0 rounded-md border border-input bg-card px-3 text-base text-foreground shadow-control transition-colors duration-150 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:cursor-not-allowed disabled:opacity-45 aria-invalid:border-destructive aria-invalid:ring-destructive/20 sm:text-sm";
export function Input({
  className,
  type,
  ...props
}: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        controlClass,
        "h-11 sm:h-9 file:mr-3 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
        className,
      )}
      {...props}
    />
  );
}
