import * as React from "react";
import { cn } from "@/lib/utils";
export function Alert({
  className,
  tone = "neutral",
  ...props
}: React.ComponentProps<"div"> & {
  tone?: "neutral" | "success" | "warning" | "danger";
}) {
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn(
        "rounded-panel border p-4 text-sm leading-6",
        {
          neutral: "border-border bg-muted text-foreground",
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
