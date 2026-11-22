/**
 * @fileoverview Component khung tải dữ liệu giả Skeleton (UI primitives Shadcn-style).
 *
 * Mục đích & vai trò:
 * - Cung cấp UI primitive tạo hiệu ứng nhấp nháy (`animate-pulse`) để giữ bố cục trang
 *   và báo hiệu đang tải dữ liệu thay vì màn hình trắng.
 *
 * Props:
 * - `className` {string}: Class Tailwind quy định kích thước (`h-*`, `w-*`) và hình dáng khối skeleton.
 * - `...props`: Các thuộc tính HTML chuẩn của thẻ `<div>`.
 */
import { cn } from "../../lib/utils.js";

/**
 * Khối placeholder nhấp nháy dùng trong các màn hình loading state.
 */
function Skeleton({ className, ...props }) {
  return (
    <div
      className={cn("animate-pulse rounded-lg bg-brand-bone/60", className)}
      {...props}
    />
  );
}

export { Skeleton };
