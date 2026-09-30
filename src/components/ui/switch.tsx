"use client";
import * as React from "react";
import { Switch as Primitive } from "radix-ui";
import { cn } from "@/lib/utils";
export function Switch({
  className,
  ...props
}: React.ComponentProps<typeof Primitive.Root>) {
  return (
    <Primitive.Root
      className={cn(
        "inline-flex h-6 w-10 shrink-0 items-center rounded-full border border-input bg-muted p-0.5 transition-colors data-[state=checked]:border-primary data-[state=checked]:bg-primary disabled:opacity-45",
        className,
      )}
      {...props}
    >
      <Primitive.Thumb className="block size-4 rounded-full bg-muted-foreground shadow-sm transition-transform duration-150 data-[state=checked]:translate-x-4 data-[state=checked]:bg-primary-foreground" />
    </Primitive.Root>
  );
}
