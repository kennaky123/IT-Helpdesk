import { forwardRef } from "react";
import { cn } from "../../lib/utils.js";

const Input = forwardRef(function Input({ className, type = "text", ...props }, ref) {
  return (
    <input
      ref={ref}
      type={type}
      className={cn(
        "flex min-h-9 w-full rounded-xl border border-brand-bone bg-white px-3 py-1.5 text-xs font-medium text-brand-ink outline-none transition placeholder:text-brand-ash focus:border-brand-violet focus:ring-2 focus:ring-brand-violet/20 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
});

export { Input };
