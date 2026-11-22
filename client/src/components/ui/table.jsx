import { forwardRef } from "react";
import { cn } from "../../lib/utils.js";

const Table = forwardRef(function Table({ className, ...props }, ref) {
  return (
    <div className="w-full overflow-x-auto">
      <table ref={ref} className={cn("w-full border-collapse text-left text-xs", className)} {...props} />
    </div>
  );
});

const TableHeader = forwardRef(function TableHeader({ className, ...props }, ref) {
  return (
    <thead
      ref={ref}
      className={cn("border-b border-brand-bone bg-brand-mist/70 text-[11px] font-bold tracking-wider text-brand-slate uppercase", className)}
      {...props}
    />
  );
});

const TableBody = forwardRef(function TableBody({ className, ...props }, ref) {
  return <tbody ref={ref} className={cn("divide-y divide-brand-bone", className)} {...props} />;
});

const TableRow = forwardRef(function TableRow({ className, ...props }, ref) {
  return (
    <tr
      ref={ref}
      className={cn("transition-colors hover:bg-brand-violet/[0.03]", className)}
      {...props}
    />
  );
});

const TableHead = forwardRef(function TableHead({ className, ...props }, ref) {
  return <th ref={ref} className={cn("px-4 py-3 font-bold", className)} {...props} />;
});

const TableCell = forwardRef(function TableCell({ className, ...props }, ref) {
  return <td ref={ref} className={cn("px-4 py-3.5 align-middle", className)} {...props} />;
});

export { Table, TableHeader, TableBody, TableRow, TableHead, TableCell };
