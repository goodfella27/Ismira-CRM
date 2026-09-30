"use client";
import * as React from "react";
import { Tooltip as Primitive } from "radix-ui";
import { cn } from "@/lib/utils";
export const TooltipProvider = Primitive.Provider;
export const Tooltip = Primitive.Root;
export const TooltipTrigger = Primitive.Trigger;
export function TooltipContent({
  className,
  ...props
}: React.ComponentProps<typeof Primitive.Content>) {
  return (
    <Primitive.Portal>
      <Primitive.Content
        sideOffset={6}
        className={cn(
          "z-[10040] max-w-72 rounded-md border border-border bg-popover px-3 py-2 text-xs leading-5 text-popover-foreground shadow-overlay",
          className,
        )}
        {...props}
      />
    </Primitive.Portal>
  );
}
