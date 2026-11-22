/**
 * Provider quản lý vòng đời phiên đăng nhập toàn cục cho ứng dụng React.
 * Vai trò: Khôi phục trạng thái xác thực từ lưu trữ cục bộ / API khi khởi động ứng dụng
 * và lắng nghe sự kiện lỗi 401 từ axiosClient để đồng bộ đăng xuất tự động.
 */
import { useEffect } from "react";
import { AUTH_UNAUTHORIZED_EVENT } from "../api/axiosClient.js";
import { useAuthStore } from "../stores/useAuthStore.js";

/**
 * Bao bọc cây component gốc để kích hoạt kiểm tra phiên đăng nhập và bắt sự kiện 401.
 */
function AuthProvider({ children }) {
  const initializeAuth = useAuthStore((state) => state.initializeAuth);
  const logout = useAuthStore((state) => state.logout);

  // Khôi phục thông tin người dùng hiện tại khi ứng dụng mount lần đầu
  useEffect(() => {
    initializeAuth();
  }, [initializeAuth]);

  // Đăng ký listener toàn cục: tự động đưa store về trạng thái đã đăng xuất khi token hết hạn (401)
  useEffect(() => {
    function handleUnauthorized() {
      logout();
    }

    window.addEventListener(AUTH_UNAUTHORIZED_EVENT, handleUnauthorized);
    return () => {
      window.removeEventListener(AUTH_UNAUTHORIZED_EVENT, handleUnauthorized);
    };
  }, [logout]);

  return children;
}

export default AuthProvider;
