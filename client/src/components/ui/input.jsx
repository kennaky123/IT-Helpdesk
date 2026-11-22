/**
 * @fileoverview Component ô nhập liệu chuẩn Input (UI primitives Shadcn-style).
 *
 * Mục đích & vai trò:
 * - Cung cấp UI primitive `<input>` đồng nhất về viền, chiều cao tối thiểu, focus-ring tím
 *   và trạng thái disabled trên các biểu mẫu trong hệ thống.
 *
 * Props:
 * - `className` {string}: Class CSS bổ sung.
 * - `type` {string}: Kiểu input HTML (mặc định `"text"`).
 * - `...props`: Các thuộc tính HTML chuẩn của thẻ `<input>` (chuyển tiếp cả `ref`).
 */
import { forwardRef } from "react";
import { cn } from "../../lib/utils.js";

/**
 * Component Input sử dụng forwardRef để tương thích với các thư viện form hoặc ref DOM trực tiếp.
 */
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
