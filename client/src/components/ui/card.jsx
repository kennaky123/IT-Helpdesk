import { cn } from "../../lib/utils.js";

function Card({ className, ...props }) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-brand-bone bg-white text-brand-ink shadow-xs",
        className,
      )}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }) {
  return (
    <div
      className={cn("flex flex-col space-y-1 border-b border-brand-bone px-5 py-4", className)}
      {...props}
    />
  );
}

function CardTitle({ className, ...props }) {
  return (
    <h3
      className={cn("font-display text-sm font-bold text-brand-ink", className)}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }) {
  return <p className={cn("text-xs text-brand-slate", className)} {...props} />;
}

function CardContent({ className, ...props }) {
  return <div className={cn("p-5", className)} {...props} />;
}

function CardFooter({ className, ...props }) {
  return (
    <div
      className={cn("flex items-center border-t border-brand-bone px-5 py-3.5", className)}
      {...props}
    />
  );
}

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter };
