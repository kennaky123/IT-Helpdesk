/**
 * @file userService.js
 * @description Service quản lý thông tin tài khoản hiện tại (hồ sơ, ảnh đại diện, đổi mật khẩu) và danh sách kỹ thuật viên.
 * Vai trò trong kiến trúc Frontend: Thuộc tầng API Services, giao tiếp với các endpoint `/auth/*` và `/technicians`
 * qua `axiosClient`, đồng thời tối ưu tránh gọi trùng lặp API `/auth/me` bằng cơ chế gộp request đồng thời.
 */
import axiosClient from "../api/axiosClient.js";
import {
  isValidUser,
  parseAuthenticationData,
} from "./authService.js";

// Biến lưu Promise của request getCurrentUser() đang chạy nhằm gộp các lần gọi đồng thời (in-flight deduplication)
let currentUserRequest = null;

/**
 * Tạo đối tượng lỗi gắn mã `"INVALID_USER_RESPONSE"` khi dữ liệu người dùng từ API sai cấu trúc.
 *
 * @param {string} message - Nội dung thông báo lỗi.
 * @returns {Error & { code: string }}
 */
function createInvalidUserResponseError(message) {
  const error = new Error(message);
  error.code = "INVALID_USER_RESPONSE";
  return error;
}

/**
 * Lấy thông tin tài khoản người dùng đang đăng nhập (`/auth/me`).
 * Nếu có nhiều nơi gọi đồng thời khi một request chưa xong, hàm sẽ tái sử dụng chung một Promise.
 *
 * @returns {Promise<object>} Đối tượng thông tin người dùng đã kiểm chứng hợp lệ.
 */
export function getCurrentUser() {
  // Chỉ tạo HTTP request mới nếu chưa có request /auth/me nào đang chờ kết quả
  if (!currentUserRequest) {
    currentUserRequest = axiosClient
      .get("/auth/me")
      .then((response) => {
        const user = response.data?.data?.user;

        if (!isValidUser(user)) {
          throw createInvalidUserResponseError(
            "Phản hồi thông tin tài khoản không hợp lệ.",
          );
        }

        return user;
      })
      .finally(() => {
        // Giải phóng tham chiếu sau khi hoàn tất (thành công hoặc lỗi) để các lần gọi sau lấy dữ liệu mới
        currentUserRequest = null;
      });
  }

  return currentUserRequest;
}

/**
 * Cập nhật thông tin hồ sơ cá nhân (họ tên, số điện thoại, phòng ban...).
 *
 * @param {object} payload - Dữ liệu hồ sơ cần cập nhật.
 * @returns {Promise<object>} Gói dữ liệu phiên mới (`user` và `accessToken` nếu server cấp lại).
 */
export async function updateUserProfile(payload) {
  const response = await axiosClient.patch("/auth/profile", payload);
  return parseAuthenticationData(response.data?.data);
}

/**
 * Tải lên ảnh đại diện mới cho tài khoản đang đăng nhập.
 *
 * @param {File} file - Tệp hình ảnh người dùng chọn.
 * @returns {Promise<object>} Dữ liệu phiên đã cập nhật đường dẫn ảnh đại diện mới.
 */
export async function updateUserAvatar(file) {
  const formData = new FormData();
  formData.append("avatar", file);

  const response = await axiosClient.post("/auth/avatar", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });
  return parseAuthenticationData(response.data?.data);
}

/**
 * Đổi mật khẩu đăng nhập của tài khoản hiện tại.
 *
 * @param {{ currentPassword: string, newPassword: string }} payload - Mật khẩu hiện tại và mật khẩu mới.
 * @returns {Promise<object>} Dữ liệu phiên mới kèm token cập nhật sau khi đổi mật khẩu.
 */
export async function changePassword(payload) {
  const response = await axiosClient.patch("/auth/change-password", payload);
  return parseAuthenticationData(response.data?.data);
}

/**
 * Lấy danh sách kỹ thuật viên đang hoạt động để gán xử lý hoặc lọc ticket.
 *
 * @param {{ signal?: AbortSignal }} [options] - Tùy chọn hủy request từ React Query.
 * @returns {Promise<Array<object>>} Danh sách kỹ thuật viên có `_id` và `fullName` hợp lệ.
 */
export async function getActiveTechnicians({ signal } = {}) {
  const response = await axiosClient.get("/technicians", { signal });
  const technicians = response.data?.data?.technicians;

  if (
    !Array.isArray(technicians) ||
    !technicians.every(
      (technician) =>
        technician &&
        typeof technician._id === "string" &&
        typeof technician.fullName === "string",
    )
  ) {
    throw createInvalidUserResponseError(
      "Phản hồi danh sách technician không hợp lệ.",
    );
  }

  return technicians;
}

/**
 * Chuyển đổi lỗi từ các thao tác người dùng/hồ sơ thành thông điệp tiếng Việt thân thiện.
 *
 * @param {any} error - Lỗi từ axios hoặc validator nội bộ.
 * @returns {string} Thông báo lỗi phù hợp để hiển thị trên UI.
 */
export function getUserServiceErrorMessage(error) {
  if (error?.code === "ECONNABORTED") {
    return "Máy chủ phản hồi quá lâu. Vui lòng thử lại.";
  }

  if (
    error?.code === "INVALID_USER_RESPONSE" ||
    error?.code === "INVALID_AUTH_RESPONSE"
  ) {
    return "Dữ liệu tài khoản nhận được không đúng định dạng.";
  }

  if (!error?.response) {
    return "Không thể kết nối đến máy chủ để tải dữ liệu người dùng.";
  }

  if (error.response.status === 403) {
    return "Tài khoản của bạn không có quyền thực hiện thao tác này.";
  }

  const apiMessage = error.response.data?.message;
  return typeof apiMessage === "string" && apiMessage.length > 0
    ? apiMessage
    : "Không thể tải dữ liệu người dùng. Vui lòng thử lại.";
}
