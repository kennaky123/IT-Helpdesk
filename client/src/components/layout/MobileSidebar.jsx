/**
 * Ngăn kéo điều hướng (Drawer) trượt từ cạnh trái dành cho thiết bị di động / màn hình dưới breakpoint `lg`.
 *
 * Props:
 * - open: Cờ điều khiển hiển thị drawer.
 * - onClose: Callback đóng drawer khi bấm backdrop, nút X, phím Escape, chọn route hoặc mở rộng màn hình lên desktop.
 *
 * Vai trò trong UI Layout / Navigation:
 * - Bao bọc `SidebarContent` dưới dạng modal dialog có focus trap, khóa cuộn nền và đặt `inert` cho phần nội dung chính.
 */
import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { SidebarContent } from "./Sidebar.jsx";

// Bộ CSS selector dùng để truy vấn các phần tử có thể nhận focus bàn phím bên trong drawer nhằm tạo focus trap.
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/**
 * Render drawer điều hướng di động kèm quản lý focus, phím tắt bàn phím và tự động đóng khi chuyển sang viewport desktop.
 */
function MobileSidebar({ open, onClose }) {
  const dialogRef = useRef(null);
  const closeButtonRef = useRef(null);

  // Quản lý toàn bộ hiệu ứng phụ về accessibility và sự kiện khi MobileSidebar mở:
  // 1) Lưu lại phần tử đang focus trước đó để trả focus khi đóng.
  // 2) Khóa cuộn body và gắn thuộc tính `inert` lên vùng nội dung chính để chặn tương tác/tab ra nền.
  // 3) Focus nút đóng sau 1 animation frame, bẫy phím Tab/Shift+Tab trong drawer và xử lý phím Escape.
  // 4) Lắng nghe media query (min-width: 1024px) để tự đóng drawer nếu người dùng phóng to cửa sổ lên desktop.
  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const previouslyFocusedElement = document.activeElement;
    const pageContent = document.querySelector("[data-app-shell-content]");
    const previousOverflow = document.body.style.overflow;
    const mediaQuery = window.matchMedia("(min-width: 1024px)");
    const focusFrame = window.requestAnimationFrame(() => {
      closeButtonRef.current?.focus();
    });

    document.body.style.overflow = "hidden";
    pageContent?.setAttribute("inert", "");

    // Xử lý phím Escape (đóng drawer) và Tab/Shift+Tab (xoay vòng focus bên trong dialogRef).
    function handleKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab" || !dialogRef.current) {
        return;
      }

      const focusableElements = Array.from(
        dialogRef.current.querySelectorAll(FOCUSABLE_SELECTOR),
      );
      const firstElement = focusableElements[0];
      const lastElement = focusableElements.at(-1);

      if (!firstElement || !lastElement) {
        event.preventDefault();
        return;
      }

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    }

    // Tự động đóng menu di động khi kích thước màn hình đạt breakpoint desktop (lg: 1024px).
    function handleDesktopViewport(event) {
      if (event.matches) {
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    mediaQuery.addEventListener("change", handleDesktopViewport);

    // Dọn dẹp listeners, khôi phục scroll/inert và trả focus về nút mở menu ban đầu.
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleKeyDown);
      mediaQuery.removeEventListener("change", handleDesktopViewport);
      document.body.style.overflow = previousOverflow;
      pageContent?.removeAttribute("inert");

      if (previouslyFocusedElement instanceof HTMLElement) {
        previouslyFocusedElement.focus();
      }
    };
  }, [onClose, open]);

  return (
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <motion.button
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="absolute inset-0 cursor-default bg-slate-950/55 backdrop-blur-[1px]"
            onClick={onClose}
            aria-label="Đóng menu điều hướng"
          />
          <motion.aside
            ref={dialogRef}
            id="mobile-sidebar"
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "spring", stiffness: 360, damping: 34 }}
            className="relative h-full w-[min(20rem,88vw)] shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mobile-sidebar-title"
          >
            <h2 id="mobile-sidebar-title" className="sr-only">
              Menu điều hướng
            </h2>
            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              className="absolute top-3 right-3 z-10 flex size-10 items-center justify-center rounded-lg text-slate-300 transition hover:bg-slate-800 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400"
              aria-label="Đóng menu"
            >
              <X className="size-5" aria-hidden="true" />
            </button>
            <SidebarContent onNavigate={onClose} />
          </motion.aside>
        </div>
      ) : null}
    </AnimatePresence>
  );
}

export default MobileSidebar;
