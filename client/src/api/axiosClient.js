/**
 * Axios HTTP Client dùng chung cho toàn bộ tầng service gọi API của ứng dụng frontend.
 * Vai trò: Thiết lập baseURL, timeout, cookie credentials, tự động gắn Bearer JWT token
 * vào request cần xác thực và xử lý tập trung lỗi 401 (hết hạn/không hợp lệ phiên đăng nhập).
 */
import axios from "axios";
import { clientEnv } from "../config/env.js";
import {
  clearAuthSession,
  getStoredAccessToken,
} from "../utils/authStorage.js";

// Tên sự kiện tùy chỉnh phát trên window khi API trả về 401 để AuthProvider tự động đăng xuất
export const AUTH_UNAUTHORIZED_EVENT = "it-helpdesk:auth-unauthorized";

// Khởi tạo instance Axios với cấu hình chuẩn cho toàn bộ API backend
const axiosClient = axios.create({
  baseURL: clientEnv.apiUrl,
  timeout: 10_000,
  withCredentials: true,
  headers: {
    Accept: "application/json",
  },
});

// Request Interceptor: Tự động đính kèm Access Token vào header Authorization (trừ request đánh dấu skipAuth)
axiosClient.interceptors.request.use((config) => {
  if (config.skipAuth) {
    return config;
  }

  const accessToken = getStoredAccessToken();

  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }

  return config;
});

// Response Interceptor: Bắt lỗi 401 ở các endpoint yêu cầu đăng nhập để dọn session và đồng bộ logout
axiosClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const isPrivateRequest = !error.config?.skipAuth;

    if (error.response?.status === 401 && isPrivateRequest) {
      // Xóa token/thông tin user lưu cục bộ trước khi thông báo cho AuthProvider
      clearAuthSession();

      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event(AUTH_UNAUTHORIZED_EVENT));
      }
    }

    return Promise.reject(error);
  },
);

export default axiosClient;
