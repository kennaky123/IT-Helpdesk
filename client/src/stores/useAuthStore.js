/**
 * @file useAuthStore.js
 * @description Zustand Store quản lý trạng thái xác thực toàn cục (phiên đăng nhập, người dùng hiện tại, loading khởi tạo).
 * Vai trò trong kiến trúc Frontend: Thuộc tầng Zustand Stores, là nguồn lưu trữ state đăng nhập trung tâm,
 * đồng bộ hai chiều với bộ nhớ trình duyệt (`authStorage`), API xác thực (`authService`/`userService`)
 * và dọn dẹp cache React Query khi người dùng đăng xuất.
 */
import { create } from "zustand";
import { queryClient } from "../lib/queryClient.js";
import { login as requestLogin } from "../services/authService.js";
import { getCurrentUser } from "../services/userService.js";
import {
  clearAuthSession,
  getStoredAuthSession,
  saveAuthSession,
  updateStoredUser,
} from "../utils/authStorage.js";

/**
 * Đọc phiên đã lưu từ localStorage/sessionStorage để khởi tạo trạng thái ban đầu ngay khi tải ứng dụng.
 *
 * @returns {{ user: object | null, isAuthenticated: boolean, isLoading: boolean }}
 * Trạng thái ban đầu (`isLoading: true` nếu tìm thấy phiên cần xác minh lại với máy chủ).
 */
function getInitialAuthState() {
  const storedSession = getStoredAuthSession();
  return {
    user: storedSession?.user ?? null,
    isAuthenticated: Boolean(storedSession?.user),
    // Chỉ bật trạng thái đang tải khi có phiên cục bộ cần gọi /auth/me để kiểm chứng lại
    isLoading: Boolean(storedSession),
  };
}

/**
 * Zustand store điều khiển vòng đời phiên xác thực người dùng.
 *
 * State:
 * - `user`: Thông tin tài khoản đang đăng nhập (`null` nếu chưa đăng nhập).
 * - `isAuthenticated`: Cờ xác nhận người dùng đã xác thực hợp lệ hay chưa.
 * - `isLoading`: Cờ đánh dấu quá trình đồng bộ phiên lúc khởi động ứng dụng.
 */
export const useAuthStore = create((set) => ({
  ...getInitialAuthState(),

  /**
   * Khởi tạo và xác minh lại phiên đăng nhập khi ứng dụng mount lần đầu.
   * Cơ chế Zustand state & đồng bộ:
   * - Không có phiên lưu trữ -> đặt ngay trạng thái chưa đăng nhập.
   * - Có phiên -> gọi `getCurrentUser()` lấy thông tin mới nhất và cập nhật storage + store.
   * - Nếu gặp 401/403 hoặc dữ liệu sai cấu trúc -> xóa phiên và đăng xuất.
   * - Nếu lỗi mạng/5xx tạm thời -> giữ lại user đã lưu để không làm văng phiên người dùng.
   *
   * @returns {Promise<void>}
   */
  initializeAuth: async () => {
    const storedSession = getStoredAuthSession();
    if (!storedSession) {
      set({ user: null, isAuthenticated: false, isLoading: false });
      return;
    }

    try {
      // Xác thực lại token với máy chủ và làm mới thông tin user
      const user = await getCurrentUser();
      updateStoredUser(user);
      set({ user, isAuthenticated: true, isLoading: false });
    } catch (error) {
      const statusCode = error.response?.status;
      // Chỉ hủy phiên khi token không hợp lệ / bị từ chối quyền hoặc payload hỏng
      if (
        statusCode === 401 ||
        statusCode === 403 ||
        error.code === "INVALID_AUTH_RESPONSE" ||
        error.code === "INVALID_USER_RESPONSE"
      ) {
        clearAuthSession();
        set({ user: null, isAuthenticated: false, isLoading: false });
        return;
      }
      // Giữ tạm phiên cục bộ nếu lỗi xuất phát từ mất mạng hoặc sự cố tạm thời của server
      set({ user: storedSession.user, isAuthenticated: true, isLoading: false });
    }
  },

  /**
   * Thực hiện đăng nhập, lưu phiên xuống storage theo tùy chọn `rememberMe` và cập nhật store.
   *
   * @param {{ email: string, password: string, rememberMe?: boolean }} credentials - Thông tin đăng nhập.
   * @returns {Promise<object>} Đối tượng `user` sau khi đăng nhập thành công.
   */
  login: async ({ email, password, rememberMe }) => {
    const authenticationData = await requestLogin({ email, password });
    // Lưu token vào localStorage (rememberMe = true) hoặc sessionStorage (rememberMe = false)
    saveAuthSession(authenticationData, rememberMe);
    set({
      user: authenticationData.user,
      isAuthenticated: true,
      isLoading: false,
    });
    return authenticationData.user;
  },

  /**
   * Đăng xuất tài khoản: xóa phiên lưu trữ, xóa toàn bộ cache React Query và reset store.
   *
   * @returns {void}
   */
  logout: () => {
    clearAuthSession();
    // Xóa sạch cache React Query để tránh lộ dữ liệu của tài khoản cũ khi đổi tài khoản
    queryClient.clear();
    set({ user: null, isAuthenticated: false, isLoading: false });
  },

  /**
   * Cập nhật lại thông tin người dùng (và accessToken mới nếu có) sau khi sửa hồ sơ, avatar hoặc đổi mật khẩu.
   *
   * @param {{ user?: object, accessToken?: string }} authenticationData - Dữ liệu phiên cập nhật từ API.
   * @returns {void}
   */
  updateUserSession: (authenticationData) => {
    // Nếu có accessToken mới thì lưu đè toàn bộ phiên nhưng giữ nguyên chế độ rememberMe hiện tại
    if (authenticationData?.user && authenticationData?.accessToken) {
      const storedSession = getStoredAuthSession();
      const rememberMe = storedSession?.rememberMe ?? false;
      saveAuthSession(authenticationData, rememberMe);
      set({
        user: authenticationData.user,
        isAuthenticated: true,
        isLoading: false,
      });
    } else if (authenticationData?.user) {
      // Nếu chỉ cập nhật thông tin hồ sơ user mà không cấp lại token mới
      updateStoredUser(authenticationData.user);
      set({
        user: authenticationData.user,
        isAuthenticated: true,
        isLoading: false,
      });
    }
  },
}));
