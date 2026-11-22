import { Slot } from "@radix-ui/react-slot";
import { cva } from "class-variance-authority";
import { forwardRef } from "react";
import { cn } from "../../lib/utils.js";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg text-xs font-semibold transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-violet disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-brand-ink text-white shadow-xs hover:bg-brand-carbon",
        primary: "bg-brand-violet text-white shadow-xs hover:bg-brand-violet/90",
        destructive: "bg-red-600 text-white shadow-xs hover:bg-red-700",
        outline:
          "border border-brand-bone bg-white text-brand-ink shadow-2xs hover:bg-brand-mist",
        secondary:
          "bg-brand-mist text-brand-ink hover:bg-brand-bone/60",
        ghost: "text-brand-slate hover:bg-brand-mist hover:text-brand-ink",
        link: "text-brand-violet underline-offset-4 hover:underline",
      },
      size: {
        default: "min-h-9 px-4 py-2",
        sm: "min-h-8 px-3 py-1.5",
        lg: "min-h-10 px-5 py-2.5 text-sm",
        pill: "min-h-9 rounded-full px-4 py-2",
        icon: "size-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

const Button = forwardRef(function Button(
  { className, variant, size, asChild = false, ...props },
  ref,
) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      ref={ref}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
});

export { Button };
