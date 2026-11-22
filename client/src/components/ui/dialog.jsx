/**
 * @fileoverview Bộ component hộp thoại Dialog dựng trên Radix UI (UI primitives Shadcn-style).
 *
 * Mục đích & vai trò:
 * - Cung cấp các primitive hộp thoại modal chuẩn accessibility (focus trap, phím ESC để đóng,
 *   ARIA attributes) gồm: `Dialog`, `DialogTrigger`, `DialogPortal`, `DialogClose`, `DialogOverlay`,
 *   `DialogContent`, `DialogHeader`, `DialogFooter`, `DialogTitle`, `DialogDescription`.
 *
 * Props chính:
 * - `DialogContent`: nhận `hideClose` (`boolean`, mặc định `false`) để ẩn nút đóng `X` góc phải,
 *   cùng `className` và `children`.
 * - Các sub-component khác nhận `className` và `...props` của Radix / DOM tương ứng.
 */
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { forwardRef } from "react";
import { cn } from "../../lib/utils.js";

// Export trực tiếp các primitive điều khiển trạng thái và Portal từ @radix-ui/react-dialog
const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogPortal = DialogPrimitive.Portal;
const DialogClose = DialogPrimitive.Close;

/**
 * Lớp phủ nền tối có hiệu ứng làm mờ phía sau hộp thoại modal.
 */
const DialogOverlay = forwardRef(function DialogOverlay({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Overlay
      ref={ref}
      className={cn(
        "fixed inset-0 z-[100] bg-slate-950/60 backdrop-blur-[1px]",
        className,
      )}
      {...props}
    />
  );
});

/**
 * Khung nội dung modal căn giữa màn hình qua Portal, đi kèm Overlay và nút đóng tùy chọn.
 */
const DialogContent = forwardRef(function DialogContent(
  { className, children, hideClose = false, ...props },
  ref,
) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          "fixed top-1/2 left-1/2 z-[101] max-h-[92vh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-brand-bone bg-white shadow-2xl outline-none",
          className,
        )}
        {...props}
      >
        {children}
        {/* Nút đóng nhanh góc trên bên phải (ẩn khi hideClose = true) */}
        {!hideClose ? (
          <DialogPrimitive.Close
            className="absolute top-4 right-4 flex size-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
            aria-label="Đóng"
          >
            <X className="size-4" />
          </DialogPrimitive.Close>
        ) : null}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
});

/**
 * Phần đầu của Dialog chứa tiêu đề và mô tả.
 */
function DialogHeader({ className, ...props }) {
  return (
    <div
      className={cn("flex flex-col space-y-1 border-b border-brand-bone p-5 sm:p-6", className)}
      {...props}
    />
  );
}

/**
 * Phần chân Dialog chứa các nút hành động, tự xếp dọc trên mobile và ngang trên màn hình lớn.
 */
function DialogFooter({ className, ...props }) {
  return (
    <div
      className={cn(
        "flex flex-col-reverse gap-2.5 border-t border-brand-bone bg-slate-50 px-5 py-4 sm:flex-row sm:justify-end sm:px-6",
        className,
      )}
      {...props}
    />
  );
}

/**
 * Tiêu đề chính của Dialog, hỗ trợ gán aria-labelledby tự động bởi Radix.
 */
const DialogTitle = forwardRef(function DialogTitle({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Title
      ref={ref}
      className={cn("font-display text-lg font-bold text-slate-900", className)}
      {...props}
    />
  );
});

/**
 * Mô tả phụ của Dialog, hỗ trợ gán aria-describedby tự động bởi Radix.
 */
const DialogDescription = forwardRef(function DialogDescription({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Description
      ref={ref}
      className={cn("text-sm leading-6 text-slate-600", className)}
      {...props}
    />
  );
});

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
