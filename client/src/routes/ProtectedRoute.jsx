/**
 * Route Guard bảo vệ các tuyến đường yêu cầu người dùng đã đăng nhập.
 * Vai trò: Ngăn truy cập trái phép vào các trang nội bộ khi chưa có phiên xác thực hợp lệ,
 * đồng thời giữ lại vị trí URL ban đầu để điều hướng ngược lại sau khi đăng nhập thành công.
 */
import { Navigate, Outlet, useLocation } from "react-router-dom";
import AuthLoadingScreen from "../components/auth/AuthLoadingScreen.jsx";
import useAuth from "../hooks/useAuth.js";

/**
 * Kiểm tra trạng thái xác thực trước khi render các route con qua <Outlet />.
 */
function ProtectedRoute() {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  // Chờ quá trình khôi phục phiên đăng nhập ban đầu hoàn tất trước khi quyết định chuyển hướng
  if (isLoading) {
    return <AuthLoadingScreen />;
  }

  // Nếu chưa đăng nhập, chuyển hướng về trang /login và lưu lại đường dẫn hiện tại trong location.state.from
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // Hợp lệ: cho phép render nhánh route con được bảo vệ
  return <Outlet />;
}

export default ProtectedRoute;
