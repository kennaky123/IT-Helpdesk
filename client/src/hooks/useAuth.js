/**
 * @file useAuth.js
 * @description Custom Hook cung cấp giao diện truy cập thống nhất vào trạng thái xác thực người dùng.
 * Vai trò trong kiến trúc Frontend: Thuộc tầng Custom Hooks, đóng vai trò lớp bao (facade)
 * tách biệt các UI component khỏi chi tiết triển khai của Zustand store `useAuthStore`.
 */
import { useAuthStore } from "../stores/useAuthStore.js";

/**
 * Truy cập trạng thái xác thực hiện tại và các hành động đăng nhập/đăng xuất/cập nhật phiên.
 *
 * Cơ chế Zustand state:
 * - Đọc trực tiếp từ `useAuthStore`, component sử dụng hook này sẽ tự động re-render
 *   khi thông tin `user`, `isAuthenticated` hoặc `isLoading` trong store thay đổi.
 *
 * @returns {object} Toàn bộ state (`user`, `isAuthenticated`, `isLoading`) và actions (`initializeAuth`, `login`, `logout`, `updateUserSession`).
 */
function useAuth() {
  // Ủy quyền hoàn toàn cho Zustand store quản lý phiên đăng nhập
  return useAuthStore();
}

export default useAuth;
