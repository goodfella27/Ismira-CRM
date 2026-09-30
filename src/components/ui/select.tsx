"use client";
import * as React from "react";
import { Select as Primitive } from "radix-ui";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { controlClass } from "./input";
export const Select = Primitive.Root;
export const SelectValue = Primitive.Value;
export function NativeSelect({
  className,
  ...props
}: React.ComponentProps<"select">) {
  return (
    <select
      className={cn(controlClass, "h-11 pr-8 sm:h-9", className)}
      {...props}
    />
  );
}
export function SelectTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof Primitive.Trigger>) {
  return (
    <Primitive.Trigger
      className={cn(
        controlClass,
        "flex min-h-11 items-center justify-between gap-2 py-2 text-left sm:min-h-9 [&>span]:min-w-0 [&>span]:truncate",
        className,
      )}
      {...props}
    >
      {children}
      <Primitive.Icon asChild>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
      </Primitive.Icon>
    </Primitive.Trigger>
  );
}
export function SelectContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof Primitive.Content>) {
  return (
    <Primitive.Portal>
      <Primitive.Content
        position="popper"
        sideOffset={5}
        className={cn(
          "z-[10020] max-h-[var(--radix-select-content-available-height)] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-panel border border-border bg-popover p-1 text-popover-foreground shadow-overlay",
          className,
        )}
        {...props}
      >
        <Primitive.ScrollUpButton className="flex justify-center py-1">
          <ChevronUp size={14} />
        </Primitive.ScrollUpButton>
        <Primitive.Viewport>{children}</Primitive.Viewport>
        <Primitive.ScrollDownButton className="flex justify-center py-1">
          <ChevronDown size={14} />
        </Primitive.ScrollDownButton>
      </Primitive.Content>
    </Primitive.Portal>
  );
}
export function SelectItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof Primitive.Item>) {
  return (
    <Primitive.Item
      className={cn(
        "relative flex min-h-9 cursor-default select-none items-center rounded-md py-2 pl-3 pr-9 text-sm outline-none data-[highlighted]:bg-accent data-[disabled]:opacity-40",
        className,
      )}
      {...props}
    >
      <Primitive.ItemText>{children}</Primitive.ItemText>
      <Primitive.ItemIndicator className="absolute right-3">
        <Check size={14} />
      </Primitive.ItemIndicator>
    </Primitive.Item>
  );
}
