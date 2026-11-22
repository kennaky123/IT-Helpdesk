/**
 * @fileoverview Bộ component điều hướng theo thẻ Tabs dựng trên Radix UI (UI primitives Shadcn-style).
 *
 * Mục đích & vai trò:
 * - Cung cấp thanh chuyển đổi nội dung theo tab (`Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`)
 *   hỗ trợ điều hướng bàn phím và ARIA chuẩn từ `@radix-ui/react-tabs`.
 *
 * Props chung:
 * - `className` {string}: Class Tailwind bổ sung.
 * - `...props`: Props chuẩn của Radix Tabs (`value`, `defaultValue`, `onValueChange`, ...).
 */
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { forwardRef } from "react";
import { cn } from "../../lib/utils.js";

// Root quản lý trạng thái tab đang chọn
const Tabs = TabsPrimitive.Root;

/**
 * Thanh nền chứa danh sách các nút chuyển tab (`TabsTrigger`).
 */
const TabsList = forwardRef(function TabsList({ className, ...props }, ref) {
  return (
    <TabsPrimitive.List
      ref={ref}
      className={cn(
        "inline-flex items-center gap-1 rounded-xl bg-brand-mist p-1 text-brand-slate",
        className,
      )}
      {...props}
    />
  );
});

/**
 * Nút kích hoạt một tab; tự đổi sang nền tím chữ trắng khi `data-[state=active]`.
 */
const TabsTrigger = forwardRef(function TabsTrigger({ className, ...props }, ref) {
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all data-[state=active]:bg-brand-violet data-[state=active]:text-white data-[state=active]:shadow-xs",
        className,
      )}
      {...props}
    />
  );
});

/**
 * Vùng hiển thị nội dung tương ứng với mỗi tab được chọn.
 */
const TabsContent = forwardRef(function TabsContent({ className, ...props }, ref) {
  return (
    <TabsPrimitive.Content ref={ref} className={cn("outline-none", className)} {...props} />
  );
});

export { Tabs, TabsList, TabsTrigger, TabsContent };
