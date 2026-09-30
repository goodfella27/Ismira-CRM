import * as React from "react";
import { cn } from "@/lib/utils";
export function Badge({
  className,
  tone = "neutral",
  ...props
}: React.ComponentProps<"span"> & {
  tone?: "neutral" | "success" | "warning" | "danger";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium",
        {
          neutral: "border-border bg-muted text-muted-foreground",
          success: "border-success/20 bg-success-muted text-success",
          warning: "border-warning/20 bg-warning-muted text-warning",
          danger: "border-destructive/20 bg-danger-muted text-destructive",
        }[tone],
        className,
      )}
      {...props}
    />
  );
}
