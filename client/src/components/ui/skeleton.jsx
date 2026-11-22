import { cn } from "../../lib/utils.js";

function Skeleton({ className, ...props }) {
  return (
    <div
      className={cn("animate-pulse rounded-lg bg-brand-bone/60", className)}
      {...props}
    />
  );
}

export { Skeleton };
