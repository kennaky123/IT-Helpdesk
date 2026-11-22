/**
 * Khung giao diện chính (Application Shell) cho toàn bộ các trang nội bộ sau khi đăng nhập.
 * Vai trò: Cung cấp Header, Sidebar di động, Command Menu (Ctrl/Cmd + K), hiệu ứng chuyển trang,
 * tự động cập nhật tiêu đề tab trình duyệt, hỗ trợ Skip Link (Accessibility) và lắng nghe
 * sự kiện realtime từ WebSocket/SSE để bắn thông báo Toast cảnh báo USB cho Admin/Technician.
 */
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { toast } from "react-toastify";
import CommandMenuModal from "../components/layout/CommandMenuModal.jsx";
import Header from "../components/layout/Header.jsx";
import MobileSidebar from "../components/layout/MobileSidebar.jsx";
import { getNavigationItemByPath } from "../constants/navigation.js";
import useAuth from "../hooks/useAuth.js";
import useRealtimeUpdates, {
  REALTIME_DATA_EVENT,
} from "../hooks/useRealtimeUpdates.js";
import { useUiStore } from "../stores/useUiStore.js";

// Tiêu đề cố định cho các trang đặc biệt không nằm trong cấu hình sidebar theo vai trò
const SPECIAL_PAGE_TITLES = {
  "/profile": "Hồ sơ cá nhân",
  "/unauthorized": "Không có quyền truy cập",
};

/**
 * Kiểm tra đường dẫn hiện tại có phải màn hình chi tiết ticket (trừ trang tạo mới) hay không.
 */
function isTicketDetailWorkspace(pathname) {
  return (
    /^\/(?:admin|user|technician)\/tickets\/[^/]+$/.test(pathname) &&
    pathname !== "/user/tickets/new"
  );
}

/**
 * Trả về tiêu đề trang phù hợp cho các route đặc biệt hoặc màn hình chi tiết ticket.
 */
function getSpecialPageTitle(pathname) {
  if (isTicketDetailWorkspace(pathname)) {
    return pathname.startsWith("/user/")
      ? "Chi tiết yêu cầu"
      : "Chi tiết ticket (3 Cột)";
  }

  return SPECIAL_PAGE_TITLES[pathname];
}

/**
 * Xác định các màn hình cần hiển thị tràn viền (full-bleed, không giới hạn max-width/padding ngoài)
 * như bảng danh sách ticket nhiều cột, cổng tổng quan người dùng hoặc workspace chi tiết ticket.
 */
function isFullBleedWorkspace(pathname) {
  if (pathname === "/user/overview") {
    return true;
  }
  if (
    pathname === "/admin/tickets" ||
    pathname === "/technician/tickets/all" ||
    pathname === "/technician/tickets/assigned" ||
    pathname === "/technician/tickets/in-progress" ||
    pathname === "/technician/history" ||
    pathname === "/user/tickets"
  ) {
    return true;
  }
  return isTicketDetailWorkspace(pathname);
}

/**
 * Component Layout chính bao bọc <Outlet /> của các route được bảo vệ.
 */
function AppLayout() {
  // Kích hoạt kết nối nhận cập nhật dữ liệu realtime (ticket, USB/DLP) từ backend
  useRealtimeUpdates();
  const mobileMenuOpen = useUiStore((state) => state.mobileMenuOpen);
  const commandMenuOpen = useUiStore((state) => state.commandMenuOpen);
  const closeMobileMenu = useUiStore((state) => state.closeMobileMenu);
  const closeCommandMenu = useUiStore((state) => state.closeCommandMenu);
  const toggleCommandMenu = useUiStore((state) => state.toggleCommandMenu);
  const { pathname } = useLocation();
  const { user } = useAuth();
  const mainContentRef = useRef(null);

  // Đồng bộ document.title theo route hiện tại và chuyển focus về vùng nội dung chính cho trình đọc màn hình
  useEffect(() => {
    const navigationItem = getNavigationItemByPath(user?.role, pathname);
    const pageTitle =
      navigationItem?.label ??
      getSpecialPageTitle(pathname) ??
      "Không tìm thấy trang";

    document.title = `${pageTitle} | DeskPro IT`;
    mainContentRef.current?.focus({ preventScroll: true });
  }, [pathname, user?.role]);

  // Đăng ký phím tắt toàn cục: Ctrl/Cmd + K để bật/tắt Command Menu và Esc để đóng
  useEffect(() => {
    function handleKeyDown(event) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        toggleCommandMenu();
      } else if (event.key === "Escape") {
        closeCommandMenu();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeCommandMenu, toggleCommandMenu]);

  // Lắng nghe sự kiện cắm/rút USB realtime và hiển thị Toast cảnh báo cho Admin & Technician
  useEffect(() => {
    if (user?.role !== "admin" && user?.role !== "technician") {
      return undefined;
    }

    function handleUsbRealtimeAlert(event) {
      const alert = event.detail?.usbAlert;
      if (!alert) return;

      const hostText = `${alert.hostname}${alert.osUsername ? ` (${alert.osUsername})` : ""}`;
      const driveText = alert.driveLetter ? ` [Ổ ${alert.driveLetter}]` : "";

      if (alert.eventType === "connected") {
        if (alert.status === "blocked") {
          toast.error(
            `🚨 CẢNH BÁO USB BỊ CHẶN: Máy ${hostText} vừa cắm "${alert.deviceName}"${driveText}!`,
            { autoClose: 8000 },
          );
        } else if (alert.status === "unverified") {
          toast.warning(
            `⚠️ Phát hiện USB mới: Máy ${hostText} vừa cắm "${alert.deviceName}"${driveText} (Chưa xác minh)`,
            { autoClose: 7000 },
          );
        } else {
          toast.info(
            `🔌 Kết nối USB hợp lệ: Máy ${hostText} vừa cắm "${alert.deviceName}"${driveText}`,
            { autoClose: 5000 },
          );
        }
      } else if (alert.eventType === "disconnected") {
        toast.info(
          `📤 Rút thiết bị USB: Máy ${hostText} đã ngắt kết nối "${alert.deviceName}"`,
          { autoClose: 4000 },
        );
      }
    }

    window.addEventListener(REALTIME_DATA_EVENT, handleUsbRealtimeAlert);
    return () => window.removeEventListener(REALTIME_DATA_EVENT, handleUsbRealtimeAlert);
  }, [user?.role]);

  const fullBleed = isFullBleedWorkspace(pathname);
  const isTicketDetail = isTicketDetailWorkspace(pathname);

  return (
    <div className="min-h-screen flex flex-col bg-brand-mist text-brand-ink">
      {/* Liên kết bỏ qua điều hướng (Skip Link) hỗ trợ điều hướng bằng bàn phím */}
      <a
        href="#main-content"
        className="fixed top-3 left-3 z-[60] -translate-y-20 rounded-full bg-brand-violet px-4 py-2 text-xs font-semibold text-white shadow-lg transition-transform focus:translate-y-0"
      >
        Chuyển đến nội dung chính
      </a>

      {/* Ngăn kéo điều hướng trên màn hình di động và hộp thoại tìm kiếm nhanh Command Menu */}
      <MobileSidebar open={mobileMenuOpen} onClose={closeMobileMenu} />
      <CommandMenuModal open={commandMenuOpen} onClose={closeCommandMenu} />

      <div className="flex-1 flex flex-col min-w-0" data-app-shell-content>
        {/* Thanh Header cố định phía trên cùng */}
        <Header />
        {/* Vùng nội dung chính hiển thị từng trang con theo route */}
        <main
          ref={mainContentRef}
          id="main-content"
          tabIndex={-1}
          className={
            fullBleed
              ? "flex-1 flex flex-col min-h-[calc(100vh-3.5rem)] outline-none"
              : "flex-1 min-h-[calc(100vh-3.5rem)] p-4 outline-none sm:p-6"
          }
        >
          {/* Hiệu ứng chuyển cảnh mượt mà khi điều hướng giữa các trang (giữ nguyên khung khi chuyển qua lại chi tiết ticket) */}
          <AnimatePresence mode="wait">
            <motion.div
              key={isTicketDetail ? "ticket-detail-workspace" : pathname}
              initial={isTicketDetail ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={isTicketDetail ? undefined : { opacity: 0, y: -6 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className={
                fullBleed
                  ? "flex flex-1 flex-col"
                  : "mx-auto w-full max-w-screen-2xl"
              }
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}

export default AppLayout;
