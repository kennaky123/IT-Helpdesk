/**
 * Cấu hình danh mục điều hướng (Navigation Menu) phân theo vai trò người dùng.
 * Vai trò: Nguồn dữ liệu duy nhất (Single Source of Truth) cho Sidebar, MobileSidebar,
 * CommandMenu và logic xác định tiêu đề trang động trong AppLayout.
 */
import {
  AppWindow,
  BarChart3,
  ChartNoAxesColumn,
  CirclePlus,
  Clock3,
  HelpCircle,
  History,
  Laptop,
  LayoutDashboard,
  Layers,
  Tags,
  Usb,
  UserCog,
  UserRound,
  UserRoundCheck,
  Users,
} from "lucide-react";

/**
 * Bản đồ cấu hình menu điều hướng tương ứng với từng role:
 * - `user`: Cổng nhân viên tự phục vụ (tạo/theo dõi ticket, thiết bị, bản quyền, hồ sơ).
 * - `technician`: Không gian xử lý sự cố IT, cấp phát tài sản, bản quyền và giám sát USB/DLP.
 * - `admin`: Quản trị toàn hệ thống, kho dữ liệu BI, nhân sự, danh mục và báo cáo.
 */
export const NAVIGATION_BY_ROLE = {
  // Menu dành cho nhân viên / người dùng cuối
  user: [
    {
      label: "Cổng Người Dùng",
      path: "/user/overview",
      icon: HelpCircle,
      iconColor: "text-brand-violet",
      end: true,
    },
    {
      label: "Yêu Cầu Của Tôi",
      path: "/user/tickets",
      icon: Layers,
      iconColor: "text-brand-blue",
      end: true,
    },
    {
      label: "Tạo Ticket Mới",
      path: "/user/tickets/new",
      icon: CirclePlus,
      iconColor: "text-emerald-600",
      end: true,
    },
    {
      label: "Thiết Bị Của Tôi",
      path: "/user/assets",
      icon: Laptop,
      iconColor: "text-brand-violet",
      end: true,
    },
    {
      label: "Bản Quyền Của Tôi",
      path: "/user/software",
      icon: AppWindow,
      iconColor: "text-brand-violet",
      end: true,
    },
    {
      label: "Hồ Sơ Cá Nhân",
      path: "/profile",
      icon: UserRound,
      end: true,
    },
  ],
  // Menu dành cho kỹ thuật viên IT Support
  technician: [
    {
      label: "Tổng Quan",
      path: "/technician/overview",
      icon: LayoutDashboard,
      iconColor: "text-brand-violet",
      end: true,
    },
    {
      label: "Tất Cả Ticket",
      path: "/technician/tickets/all",
      icon: Layers,
      iconColor: "text-brand-blue",
      end: true,
    },
    {
      label: "Hàng Đợi Được Giao",
      path: "/technician/tickets/assigned",
      icon: UserRoundCheck,
      iconColor: "text-brand-violet",
      end: true,
    },
    {
      label: "Đang Xử Lý",
      path: "/technician/tickets/in-progress",
      icon: Clock3,
      iconColor: "text-brand-blue",
      end: true,
    },
    {
      label: "Lịch Sử Xử Lý",
      path: "/technician/history",
      icon: History,
      end: true,
    },
    {
      label: "Kho & Cấp Phát Laptop",
      path: "/technician/assets",
      icon: Laptop,
      iconColor: "text-brand-violet",
      end: true,
    },
    {
      label: "Bản Quyền & FinOps",
      path: "/technician/software",
      icon: AppWindow,
      iconColor: "text-brand-violet",
      end: true,
    },
    {
      label: "Giám Sát USB & DLP",
      path: "/technician/usb-security",
      icon: Usb,
      iconColor: "text-amber-600",
      // Hiển thị chấm cảnh báo nổi bật cho module an ninh USB/DLP
      alertDot: true,
      end: true,
    },
  ],
  // Menu dành cho quản trị viên hệ thống
  admin: [
    {
      label: "Hàng Đợi Ticket",
      path: "/admin/tickets",
      icon: Layers,
      iconColor: "text-brand-violet",
      end: true,
    },
    {
      label: "Kho & Thiết Bị",
      path: "/admin/assets",
      icon: Laptop,
      iconColor: "text-brand-violet",
      end: true,
    },
    {
      label: "Bản Quyền & FinOps",
      path: "/admin/software",
      icon: AppWindow,
      iconColor: "text-brand-violet",
      end: true,
    },
    {
      label: "Giám Sát USB & DLP",
      path: "/admin/usb-security",
      icon: Usb,
      iconColor: "text-amber-600",
      // Hiển thị chấm cảnh báo nổi bật cho module an ninh USB/DLP
      alertDot: true,
      end: true,
    },
    {
      label: "Kho Dữ Liệu & BI",
      path: "/admin/dashboard",
      icon: BarChart3,
      iconColor: "text-emerald-600",
      end: true,
    },
    {
      label: "Người Dùng",
      path: "/admin/users",
      icon: Users,
      end: true,
    },
    {
      label: "Kỹ Thuật Viên",
      path: "/admin/technicians",
      icon: UserCog,
      end: true,
    },
    {
      label: "Danh Mục",
      path: "/admin/categories",
      icon: Tags,
      end: true,
    },
    {
      label: "Báo Cáo",
      path: "/admin/reports",
      icon: ChartNoAxesColumn,
      end: true,
    },
  ],
};

/**
 * Lấy danh sách các mục điều hướng hợp lệ theo vai trò; trả về mảng rỗng nếu role không khớp.
 */
export function getNavigationForRole(role) {
  return NAVIGATION_BY_ROLE[role] ?? [];
}

/**
 * Tìm mục điều hướng khớp chính xác với pathname hiện tại để xác định tiêu đề trang và trạng thái active.
 */
export function getNavigationItemByPath(role, pathname) {
  return getNavigationForRole(role).find((item) => item.path === pathname);
}
