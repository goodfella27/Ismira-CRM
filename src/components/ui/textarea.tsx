import * as React from "react";
import { cn } from "@/lib/utils";
import { controlClass } from "./input";
export function Textarea({
  className,
  ...props
}: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(controlClass, "min-h-24 py-2", className)}
      {...props}
    />
  );
}
