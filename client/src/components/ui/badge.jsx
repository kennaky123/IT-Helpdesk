import { cva } from "class-variance-authority";
import { cn } from "../../lib/utils.js";

const badgeVariants = cva(
  "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition-colors",
  {
    variants: {
      variant: {
        default: "border-transparent bg-brand-ink text-white",
        secondary: "border-brand-bone bg-brand-mist text-brand-slate",
        violet: "border-purple-200 bg-purple-50 text-brand-violet",
        blue: "border-blue-200 bg-blue-50 text-brand-blue",
        emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
        amber: "border-amber-200 bg-amber-50 text-amber-800",
        orange: "border-orange-200 bg-orange-100 text-orange-700",
        destructive: "border-red-200 bg-red-50 text-red-700",
        outline: "border-brand-bone bg-white text-brand-ink",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Badge({ className, variant, ...props }) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge };
