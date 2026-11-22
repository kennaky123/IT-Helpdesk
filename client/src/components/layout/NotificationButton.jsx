/**
 * Nút chuông và hộp thoại popover hiển thị danh sách thông báo thời gian thực trên thanh Header.
 *
 * Props: Không nhận props (đọc danh sách thông báo và các action từ `useUiStore`).
 *
 * Vai trò trong UI Layout / Navigation:
 * - Các sự kiện SSE (`data-changed`) từ endpoint `/events` được hook `useRealtimeUpdates` lắng nghe,
 *   chuyển đổi thành thông báo và đẩy vào `useUiStore` (`addNotification`).
 * - Component này hiển thị chấm báo chưa đọc trên nút chuông, tự động đánh dấu đã đọc khi mở danh sách
 *   và cho phép xóa toàn bộ thông báo tạm thời.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Bell, CheckCircle2, Info, Trash2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import useClickOutside from "../../hooks/useClickOutside.js";
import { useUiStore } from "../../stores/useUiStore.js";
import { Badge } from "../ui/badge.jsx";
import { Button } from "../ui/button.jsx";

/**
 * Chọn biểu tượng và màu nền tương ứng với mức độ nghiêm trọng của thông báo SSE ("error" | "warning" | "success" | "info").
 */
function NotificationIcon({ level }) {
  if (level === "error" || level === "warning") {
    return (
      <span
        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
          level === "error"
            ? "bg-red-50 text-red-600"
            : "bg-amber-50 text-amber-600"
        }`}
      >
        <AlertTriangle className="h-3.5 w-3.5" />
      </span>
    );
  }
  if (level === "success") {
    return (
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
        <CheckCircle2 className="h-3.5 w-3.5" />
      </span>
    );
  }
  return (
    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-brand-blue">
      <Info className="h-3.5 w-3.5" />
    </span>
  );
}

/**
 * Render nút chuông thông báo, quản lý trạng thái popover, đóng khi click ngoài/ESC và đồng bộ trạng thái đã đọc.
 */
function NotificationButton() {
  // Trạng thái đóng/mở popover danh sách thông báo.
  const [isOpen, setIsOpen] = useState(false);
  // Lấy danh sách thông báo thời gian thực (tối đa 20 mục gần nhất) và các hàm cập nhật từ useUiStore.
  const notifications = useUiStore((state) => state.notifications);
  const markAllNotificationsRead = useUiStore(
    (state) => state.markAllNotificationsRead,
  );
  const clearNotifications = useUiStore((state) => state.clearNotifications);
  const containerRef = useRef(null);
  const buttonRef = useRef(null);
  const closePopover = useCallback(() => setIsOpen(false), []);
  // Đếm số thông báo chưa đọc để quyết định hiển thị chấm tím trên icon chuông.
  const unreadCount = notifications.filter((item) => !item.read).length;

  // Đóng popover khi người dùng click ra ngoài vùng containerRef.
  useClickOutside(containerRef, closePopover, isOpen);

  // Khi popover đang mở, lắng nghe phím Escape để đóng và trả focus lại cho nút chuông.
  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    function handleEscape(event) {
      if (event.key === "Escape") {
        setIsOpen(false);
        buttonRef.current?.focus();
      }
    }

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen]);

  // Đảo trạng thái mở popover; nếu mở ra mà đang có thông báo chưa đọc thì đánh dấu tất cả là đã đọc.
  function handleToggle() {
    const nextOpen = !isOpen;
    setIsOpen(nextOpen);
    if (nextOpen && unreadCount > 0) {
      markAllNotificationsRead();
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={handleToggle}
        className="relative flex size-8 items-center justify-center rounded-full border border-brand-bone bg-brand-mist text-brand-slate transition hover:bg-brand-bone/60 hover:text-brand-ink"
        aria-label="Thông báo"
        aria-expanded={isOpen}
        aria-haspopup="dialog"
      >
        <Bell className="size-3.5" aria-hidden="true" />
        {/* Chấm tím báo hiệu có thông báo thời gian thực chưa đọc */}
        {unreadCount > 0 ? (
          <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-brand-violet ring-2 ring-white" />
        ) : null}
      </button>

      {/* Popover hiển thị danh sách thông báo đẩy từ SSE */}
      <AnimatePresence>
        {isOpen ? (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.96 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
            className="absolute top-full right-0 z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-brand-bone bg-white shadow-xl shadow-black/10"
            role="dialog"
            aria-label="Danh sách thông báo"
          >
            <div className="flex items-center justify-between border-b border-brand-bone bg-brand-mist/60 px-4 py-3">
              <div className="flex items-center gap-2">
                <h2 className="font-display text-xs font-bold tracking-wider text-brand-onyx uppercase">
                  Thông báo thời gian thực
                </h2>
                <Badge variant="violet" className="text-[10px]">
                  {notifications.length}
                </Badge>
              </div>
              {notifications.length > 0 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={clearNotifications}
                  className="h-7 px-2 text-[11px] text-brand-slate"
                >
                  <Trash2 className="h-3 w-3" />
                  Xóa
                </Button>
              ) : null}
            </div>

            {notifications.length > 0 ? (
              <div className="max-h-80 divide-y divide-brand-bone overflow-y-auto text-xs">
                {notifications.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-start gap-2.5 p-3.5 hover:bg-brand-mist/50"
                  >
                    <NotificationIcon level={item.level} />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-brand-onyx">
                        {item.title}
                      </p>
                      {item.message ? (
                        <p className="mt-0.5 text-[11px] text-brand-slate">
                          {item.message}
                        </p>
                      ) : null}
                      <p className="mt-1 font-mono text-[10px] text-brand-ash">
                        {new Date(item.createdAt).toLocaleTimeString("vi-VN")}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-4 py-6 text-center text-xs text-brand-slate">
                Chưa có thông báo mới. Sự kiện ticket và bảo mật sẽ hiển thị theo thời gian thực.
              </div>
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export default NotificationButton;
