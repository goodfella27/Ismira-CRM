"use client";
import * as React from "react";
import { RadioGroup as Primitive } from "radix-ui";
import { cn } from "@/lib/utils";
export function RadioGroup({
  className,
  ...props
}: React.ComponentProps<typeof Primitive.Root>) {
  return <Primitive.Root className={cn("grid gap-3", className)} {...props} />;
}
export function RadioGroupItem({
  className,
  ...props
}: React.ComponentProps<typeof Primitive.Item>) {
  return (
    <Primitive.Item
      className={cn(
        "flex size-4 items-center justify-center rounded-full border border-input bg-card text-foreground disabled:opacity-45",
        className,
      )}
      {...props}
    >
      <Primitive.Indicator className="size-2 rounded-full bg-primary" />
    </Primitive.Item>
  );
}
