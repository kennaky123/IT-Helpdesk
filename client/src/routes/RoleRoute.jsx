/**
 * Route Guard phân quyền theo vai trò (Role-Based Access Control - RBAC).
 * Vai trò: Đảm bảo người dùng chỉ truy cập được nhóm trang thuộc vai trò được cấp phép
 * (`user`, `technician`, hoặc `admin`), tự động chuyển hướng sang `/unauthorized` nếu không đủ quyền.
 */
import { Navigate, Outlet } from "react-router-dom";
import AuthLoadingScreen from "../components/auth/AuthLoadingScreen.jsx";
import useAuth from "../hooks/useAuth.js";

/**
 * Kiểm tra xem vai trò của người dùng hiện tại có nằm trong danh sách `allowedRoles` hay không.
 */
function RoleRoute({ allowedRoles }) {
  const { user, isAuthenticated, isLoading } = useAuth();

  // Hiển thị màn hình chờ trong lúc phiên xác thực đang được kiểm tra
  if (isLoading) {
    return <AuthLoadingScreen />;
  }

  // Chuyển về trang đăng nhập nếu người dùng chưa được xác thực
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Nếu vai trò không nằm trong danh sách cho phép, điều hướng tới trang từ chối truy cập
  if (!allowedRoles.includes(user.role)) {
    return <Navigate to="/unauthorized" replace />;
  }

  // Đủ quyền: hiển thị các route con bên trong nhóm vai trò này
  return <Outlet />;
}

export default RoleRoute;
