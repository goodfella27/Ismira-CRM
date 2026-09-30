import * as React from "react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
export const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md border text-sm font-medium transition-[color,background-color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-45 [&_svg]:shrink-0 [&_svg]:size-4",
  {
    variants: {
      variant: {
        primary:
          "border-transparent bg-primary text-primary-foreground shadow-control hover:bg-primary/90",
        secondary:
          "border-input bg-card text-foreground shadow-control hover:bg-accent",
        ghost:
          "border-transparent bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground shadow-control hover:bg-destructive/90",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-9 px-3.5 max-sm:min-h-11",
        lg: "h-11 px-5",
        icon: "size-9 p-0 max-sm:size-11",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);
export type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    pending?: boolean;
  };
export function Button({
  className,
  variant,
  size,
  asChild,
  pending,
  disabled,
  children,
  type = "button",
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      type={asChild ? undefined : type}
      disabled={asChild ? undefined : disabled || pending}
      aria-disabled={disabled || pending || undefined}
      aria-busy={pending || undefined}
      className={cn(
        buttonVariants({ variant, size }),
        (disabled || pending) && "pointer-events-none opacity-45",
        className,
      )}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
          {children}
        </>
      )}
    </Comp>
  );
}
