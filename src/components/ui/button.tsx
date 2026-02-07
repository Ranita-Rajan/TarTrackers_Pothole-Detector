import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-bold uppercase tracking-wide border-4 border-foreground transition-all duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-5 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:translate-y-[-2px] active:translate-y-[2px] shadow-[4px_4px_0px_0px_hsl(var(--foreground))] hover:shadow-[6px_6px_0px_0px_hsl(var(--foreground))] active:shadow-[2px_2px_0px_0px_hsl(var(--foreground))]",
        destructive: "bg-destructive text-destructive-foreground hover:translate-y-[-2px] active:translate-y-[2px] shadow-[4px_4px_0px_0px_hsl(var(--foreground))] hover:shadow-[6px_6px_0px_0px_hsl(var(--foreground))] active:shadow-[2px_2px_0px_0px_hsl(var(--foreground))]",
        outline: "bg-background hover:bg-accent hover:text-accent-foreground hover:translate-y-[-2px] active:translate-y-[2px] shadow-[4px_4px_0px_0px_hsl(var(--foreground))] hover:shadow-[6px_6px_0px_0px_hsl(var(--foreground))] active:shadow-[2px_2px_0px_0px_hsl(var(--foreground))]",
        secondary: "bg-secondary text-secondary-foreground hover:translate-y-[-2px] active:translate-y-[2px] shadow-[4px_4px_0px_0px_hsl(var(--foreground))] hover:shadow-[6px_6px_0px_0px_hsl(var(--foreground))] active:shadow-[2px_2px_0px_0px_hsl(var(--foreground))]",
        ghost: "border-0 shadow-none hover:bg-accent hover:text-accent-foreground",
        link: "border-0 shadow-none text-primary underline-offset-4 hover:underline",
        accent: "bg-accent text-accent-foreground hover:translate-y-[-2px] active:translate-y-[2px] shadow-[4px_4px_0px_0px_hsl(var(--foreground))] hover:shadow-[6px_6px_0px_0px_hsl(var(--foreground))] active:shadow-[2px_2px_0px_0px_hsl(var(--foreground))]",
      },
      size: {
        default: "h-12 px-6 py-3",
        sm: "h-10 rounded-lg px-4 text-xs",
        lg: "h-14 rounded-xl px-10 text-base",
        icon: "h-12 w-12",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
