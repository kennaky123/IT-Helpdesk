/**
 * @fileoverview Bộ component bố cục thẻ nội dung Card (UI primitives Shadcn-style).
 *
 * Mục đích & vai trò:
 * - Cung cấp các thành phần hộp chứa dạng thẻ (Card, CardHeader, CardTitle, CardDescription,
 *   CardContent, CardFooter) nhằm đồng bộ viền, bo góc, bóng đổ và padding trên các trang workspace.
 *
 * Props chung:
 * - `className` {string}: Class Tailwind bổ sung được trộn qua helper `cn`.
 * - `...props`: Thuộc tính HTML tiêu chuẩn của phần tử gốc tương ứng (`div`, `h3`, `p`).
 */
import { cn } from "../../lib/utils.js";

/**
 * Khung chứa chính của thẻ Card.
 */
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

/**
 * Phần đầu thẻ Card, có viền ngăn cách phía dưới với nội dung chính.
 */
function CardHeader({ className, ...props }) {
  return (
    <div
      className={cn("flex flex-col space-y-1 border-b border-brand-bone px-5 py-4", className)}
      {...props}
    />
  );
}

/**
 * Tiêu đề chính trong phần CardHeader.
 */
function CardTitle({ className, ...props }) {
  return (
    <h3
      className={cn("font-display text-sm font-bold text-brand-ink", className)}
      {...props}
    />
  );
}

/**
 * Dòng mô tả phụ nằm dưới CardTitle.
 */
function CardDescription({ className, ...props }) {
  return <p className={cn("text-xs text-brand-slate", className)} {...props} />;
}

/**
 * Vùng chứa nội dung thân thẻ Card.
 */
function CardContent({ className, ...props }) {
  return <div className={cn("p-5", className)} {...props} />;
}

/**
 * Phần chân thẻ Card, thường dùng cho các nút thao tác hoặc thông tin tóm tắt.
 */
function CardFooter({ className, ...props }) {
  return (
    <div
      className={cn("flex items-center border-t border-brand-bone px-5 py-3.5", className)}
      {...props}
    />
  );
}

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter };
