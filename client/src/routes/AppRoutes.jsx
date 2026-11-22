/**
 * Cấu hình bảng định tuyến (Routing Table) trung tâm của ứng dụng IT Helpdesk.
 * Vai trò:
 * - Tách code theo từng trang (Code Splitting) bằng React.lazy & Suspense kèm Skeleton phù hợp.
 * - Phân tách route công khai (/login, /forgot-password) và route nội bộ (ProtectedRoute + AppLayout).
 * - Áp dụng phân quyền theo vai trò (RoleRoute) cho 3 phân hệ: User, Technician và Admin.
 */
import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import AuthLoadingScreen from "../components/auth/AuthLoadingScreen.jsx";
import DashboardSkeleton from "../components/dashboard/DashboardSkeleton.jsx";
import TicketListSkeleton from "../components/ticket/TicketListSkeleton.jsx";
import CreateTicketPageSkeleton from "../components/ticket/create/CreateTicketPageSkeleton.jsx";
import TicketDetailSkeleton from "../components/ticket/detail/TicketDetailSkeleton.jsx";
import { getDefaultPathForRole } from "../constants/roles.js";
import useAuth from "../hooks/useAuth.js";
import AppLayout from "../layouts/AppLayout.jsx";
import UnauthorizedPage from "../pages/UnauthorizedPage.jsx";
import ForgotPasswordPage from "../pages/auth/ForgotPasswordPage.jsx";
import LoginPage from "../pages/auth/LoginPage.jsx";
import ProtectedRoute from "./ProtectedRoute.jsx";
import RoleRoute from "./RoleRoute.jsx";

// Tải lười (Lazy Load) các trang chức năng để giảm kích thước bundle khởi tạo ban đầu
const AdminDashboardPage = lazy(
  () => import("../pages/admin/AdminDashboardPage.jsx"),
);
const AdminTicketsPage = lazy(
  () => import("../pages/admin/AdminTicketsPage.jsx"),
);
const AdminUsersPage = lazy(
  () => import("../pages/admin/AdminUsersPage.jsx"),
);
const CreateTicketPage = lazy(
  () => import("../pages/user/CreateTicketPage.jsx"),
);
const TicketDetailPage = lazy(
  () => import("../pages/ticket/TicketDetailPage.jsx"),
);
const ProfilePage = lazy(() => import("../pages/ProfilePage.jsx"));
const NotFoundPage = lazy(() => import("../pages/NotFoundPage.jsx"));
const UserOverviewPage = lazy(() => import("../pages/user/UserOverviewPage.jsx"));
const UserTicketsPage = lazy(() => import("../pages/user/UserTicketsPage.jsx"));
const TechnicianOverviewPage = lazy(() => import("../pages/technician/TechnicianOverviewPage.jsx"));
const TechnicianAllTicketsPage = lazy(() => import("../pages/technician/TechnicianAllTicketsPage.jsx"));
const TechnicianAssignedPage = lazy(() => import("../pages/technician/TechnicianAssignedPage.jsx"));
const TechnicianInProgressPage = lazy(() => import("../pages/technician/TechnicianInProgressPage.jsx"));
const TechnicianHistoryPage = lazy(() => import("../pages/technician/TechnicianHistoryPage.jsx"));
const AdminTechniciansPage = lazy(() => import("../pages/admin/AdminTechniciansPage.jsx"));
const AdminCategoriesPage = lazy(() => import("../pages/admin/AdminCategoriesPage.jsx"));
const AdminReportsPage = lazy(() => import("../pages/admin/AdminReportsPage.jsx"));
const AssetManagementPage = lazy(() => import("../pages/admin/AssetManagementPage.jsx"));
const SoftwareLicensePage = lazy(() => import("../pages/admin/SoftwareLicensePage.jsx"));
const UsbSecurityPage = lazy(() => import("../pages/admin/UsbSecurityPage.jsx"));

/**
 * Wrapper Suspense dùng khung xương danh sách mặc định cho các trang tiêu chuẩn.
 */
function StandardPageRoute({ children }) {
  return <Suspense fallback={<TicketListSkeleton />}>{children}</Suspense>;
}

/**
 * Wrapper Suspense riêng cho trang Dashboard BI kèm DashboardSkeleton.
 */
function AdminDashboardRoute() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <AdminDashboardPage />
    </Suspense>
  );
}

/**
 * Wrapper Suspense cho trang hàng đợi Ticket của Admin.
 */
function AdminTicketsRoute() {
  return (
    <Suspense fallback={<TicketListSkeleton />}>
      <AdminTicketsPage />
    </Suspense>
  );
}

/**
 * Wrapper Suspense cho trang quản lý người dùng của Admin.
 */
function AdminUsersRoute() {
  return (
    <Suspense fallback={<TicketListSkeleton />}>
      <AdminUsersPage />
    </Suspense>
  );
}

/**
 * Wrapper Suspense cho trang tạo ticket mới kèm CreateTicketPageSkeleton.
 */
function CreateTicketRoute() {
  return (
    <Suspense fallback={<CreateTicketPageSkeleton />}>
      <CreateTicketPage />
    </Suspense>
  );
}

/**
 * Wrapper Suspense cho màn hình chi tiết ticket 3 cột kèm TicketDetailSkeleton.
 */
function TicketDetailRoute() {
  return (
    <Suspense fallback={<TicketDetailSkeleton />}>
      <TicketDetailPage />
    </Suspense>
  );
}

/**
 * Điều hướng thông minh tại đường dẫn gốc "/":
 * - Nếu đang kiểm tra phiên -> hiển thị AuthLoadingScreen.
 * - Nếu đã đăng nhập -> chuyển tới trang chủ mặc định theo vai trò.
 * - Nếu chưa đăng nhập -> chuyển tới /login.
 */
function RootRedirect() {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return <AuthLoadingScreen />;
  }

  return (
    <Navigate
      to={isAuthenticated ? getDefaultPathForRole(user.role) : "/login"}
      replace
    />
  );
}

/**
 * Khai báo toàn bộ cây định tuyến của ứng dụng.
 */
function AppRoutes() {
  return (
    <Routes>
      {/* Tuyến đường gốc và các trang xác thực công khai */}
      <Route path="/" element={<RootRedirect />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />

      {/* Nhóm tuyến đường yêu cầu đăng nhập và sử dụng khung AppLayout */}
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="unauthorized" element={<UnauthorizedPage />} />
          <Route
            path="profile"
            element={<StandardPageRoute><ProfilePage /></StandardPageRoute>}
          />

          {/* Phân hệ dành riêng cho Người dùng cuối (role: user) */}
          <Route element={<RoleRoute allowedRoles={["user"]} />}>
            <Route
              path="user/overview"
              element={<StandardPageRoute><UserOverviewPage /></StandardPageRoute>}
            />
            <Route
              path="user/tickets/new"
              element={<CreateTicketRoute />}
            />
            <Route
              path="user/tickets"
              element={<StandardPageRoute><UserTicketsPage /></StandardPageRoute>}
            />
            <Route
              path="user/tickets/:ticketId"
              element={<TicketDetailRoute />}
            />
            <Route
              path="user/assets"
              element={<StandardPageRoute><AssetManagementPage /></StandardPageRoute>}
            />
            <Route
              path="user/software"
              element={<StandardPageRoute><SoftwareLicensePage /></StandardPageRoute>}
            />
          </Route>

          {/* Phân hệ dành riêng cho Kỹ thuật viên IT (role: technician) */}
          <Route element={<RoleRoute allowedRoles={["technician"]} />}>
            <Route
              path="technician/overview"
              element={<StandardPageRoute><TechnicianOverviewPage /></StandardPageRoute>}
            />
            <Route
              path="technician/assets"
              element={<StandardPageRoute><AssetManagementPage /></StandardPageRoute>}
            />
            <Route
              path="technician/software"
              element={<StandardPageRoute><SoftwareLicensePage /></StandardPageRoute>}
            />
            <Route
              path="technician/usb-security"
              element={<StandardPageRoute><UsbSecurityPage /></StandardPageRoute>}
            />
            <Route
              path="technician/tickets/all"
              element={<StandardPageRoute><TechnicianAllTicketsPage /></StandardPageRoute>}
            />
            <Route
              path="technician/tickets/assigned"
              element={<StandardPageRoute><TechnicianAssignedPage /></StandardPageRoute>}
            />
            <Route
              path="technician/tickets/in-progress"
              element={<StandardPageRoute><TechnicianInProgressPage /></StandardPageRoute>}
            />
            <Route
              path="technician/tickets/:ticketId"
              element={<TicketDetailRoute />}
            />
            <Route
              path="technician/history"
              element={<StandardPageRoute><TechnicianHistoryPage /></StandardPageRoute>}
            />
          </Route>

          {/* Phân hệ dành riêng cho Quản trị viên hệ thống (role: admin) */}
          <Route element={<RoleRoute allowedRoles={["admin"]} />}>
            <Route
              path="admin/dashboard"
              element={<AdminDashboardRoute />}
            />
            <Route
              path="admin/tickets"
              element={<AdminTicketsRoute />}
            />
            <Route
              path="admin/tickets/:ticketId"
              element={<TicketDetailRoute />}
            />
            <Route
              path="admin/assets"
              element={<StandardPageRoute><AssetManagementPage /></StandardPageRoute>}
            />
            <Route
              path="admin/software"
              element={<StandardPageRoute><SoftwareLicensePage /></StandardPageRoute>}
            />
            <Route
              path="admin/usb-security"
              element={<StandardPageRoute><UsbSecurityPage /></StandardPageRoute>}
            />
            <Route
              path="admin/users"
              element={<AdminUsersRoute />}
            />
            <Route
              path="admin/technicians"
              element={<StandardPageRoute><AdminTechniciansPage /></StandardPageRoute>}
            />
            <Route
              path="admin/categories"
              element={<StandardPageRoute><AdminCategoriesPage /></StandardPageRoute>}
            />
            <Route
              path="admin/reports"
              element={<StandardPageRoute><AdminReportsPage /></StandardPageRoute>}
            />
          </Route>

          {/* Trang 404 bên trong AppLayout cho các đường dẫn không hợp lệ sau khi đã đăng nhập */}
          <Route
            path="*"
            element={<StandardPageRoute><NotFoundPage /></StandardPageRoute>}
          />
        </Route>
      </Route>

      {/* Bắt mọi đường dẫn lạ khi chưa đăng nhập để chuyển về luồng RootRedirect */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default AppRoutes;
