"use client";
import * as React from "react";
import { Popover as Primitive } from "radix-ui";
import { cn } from "@/lib/utils";
export const Popover = Primitive.Root;
export const PopoverTrigger = Primitive.Trigger;
export const PopoverClose = Primitive.Close;
export function PopoverContent({
  className,
  ...props
}: React.ComponentProps<typeof Primitive.Content>) {
  return (
    <Primitive.Portal>
      <Primitive.Content
        sideOffset={6}
        className={cn(
          "z-[10020] w-72 rounded-panel border border-border bg-popover p-4 text-popover-foreground shadow-overlay outline-none",
          className,
        )}
        {...props}
      />
    </Primitive.Portal>
  );
}
