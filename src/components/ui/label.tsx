import * as React from "react";
import { cn } from "@/lib/utils";
export function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      className={cn("text-sm font-medium text-foreground", className)}
      {...props}
    />
  );
}
export function FieldHint({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      className={cn("text-xs leading-5 text-muted-foreground", className)}
      {...props}
    />
  );
}
export function FieldError({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      role="alert"
      className={cn("text-xs leading-5 text-destructive", className)}
      {...props}
    />
  );
}
