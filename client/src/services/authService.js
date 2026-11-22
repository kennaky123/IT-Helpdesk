/**
 * @file authService.js
 * @description Service xử lý xác thực người dùng: đăng nhập, đăng ký, kiểm chứng payload và ánh xạ lỗi.
 * Vai trò trong kiến trúc Frontend: Thuộc tầng API Services, giao tiếp với các endpoint `/auth/*`
 * không cần token (`skipAuth: true`) và chuẩn hóa dữ liệu xác thực cho Zustand `useAuthStore`.
 */
import axiosClient from "../api/axiosClient.js";
import { USER_ROLES } from "../constants/roles.js";

/**
 * Tạo đối tượng lỗi chuẩn khi payload xác thực trả về từ Backend thiếu hoặc sai cấu trúc.
 *
 * @returns {Error & { code: string }} Lỗi gắn mã `"INVALID_AUTH_RESPONSE"`.
 */
function createInvalidAuthResponseError() {
  const error = new Error("Phản hồi xác thực không hợp lệ.");
  error.code = "INVALID_AUTH_RESPONSE";
  return error;
}

/**
 * Kiểm tra xem đối tượng `user` có đủ các trường tối thiểu và vai trò hợp lệ hay không.
 *
 * @param {unknown} user - Dữ liệu user cần kiểm chứng.
 * @returns {boolean} `true` nếu hợp lệ, ngược lại là `false`.
 */
export function isValidUser(user) {
  return Boolean(
    user &&
      typeof user._id === "string" &&
      typeof user.email === "string" &&
      typeof user.fullName === "string" &&
      USER_ROLES.includes(user.role),
  );
}

/**
 * Kiểm chứng gói dữ liệu xác thực chứa cả `user` và `accessToken` trước khi lưu phiên đăng nhập.
 *
 * @param {any} authenticationData - Payload trả về từ API login/register/profile/password.
 * @returns {object} Dữ liệu xác thực hợp lệ.
 */
export function parseAuthenticationData(authenticationData) {
  if (
    !isValidUser(authenticationData?.user) ||
    typeof authenticationData?.accessToken !== "string" ||
    authenticationData.accessToken.length === 0
  ) {
    throw createInvalidAuthResponseError();
  }

  return authenticationData;
}

/**
 * Gửi yêu cầu đăng nhập bằng email và mật khẩu.
 *
 * @param {{ email: string, password: string }} credentials - Thông tin đăng nhập.
 * @returns {Promise<object>} Gói dữ liệu `{ user, accessToken, ... }` đã kiểm chứng.
 */
export async function login(credentials) {
  // Bật skipAuth: true để interceptor không tự động đính kèm token cũ (nếu còn sót)
  const response = await axiosClient.post("/auth/login", credentials, {
    skipAuth: true,
  });
  return parseAuthenticationData(response.data?.data);
}

/**
 * Đăng ký tài khoản người dùng mới.
 *
 * @param {object} payload - Thông tin đăng ký tài khoản.
 * @returns {Promise<object>} Dữ liệu phiên đăng nhập mới sau khi đăng ký thành công.
 */
export async function register(payload) {
  // Bật skipAuth: true vì đây là request công khai chưa cần Bearer token
  const response = await axiosClient.post("/auth/register", payload, {
    skipAuth: true,
  });
  return parseAuthenticationData(response.data?.data);
}

/**
 * Chuyển đổi lỗi đăng nhập/đăng ký thành thông điệp và danh sách chi tiết lỗi tiếng Việt cho UI.
 *
 * @param {any} error - Lỗi nhận được từ axios hoặc quá trình kiểm chứng payload.
 * @returns {{ message: string, details: Array<string> }} Thông báo tổng quát và tối đa 4 lỗi chi tiết.
 */
export function getLoginError(error) {
  // Xử lý lỗi hết thời gian chờ hoặc dữ liệu phản hồi bất thường trước khi đọc HTTP status
  if (error?.code === "ECONNABORTED") {
    return {
      message: "Máy chủ phản hồi quá lâu. Vui lòng thử lại.",
      details: [],
    };
  }

  if (error?.code === "INVALID_AUTH_RESPONSE") {
    return {
      message: "Không thể xác thực tài khoản từ phản hồi của máy chủ.",
      details: [],
    };
  }

  const statusCode = error?.response?.status;
  const responseData = error?.response?.data;
  const apiMessage =
    typeof responseData?.message === "string" ? responseData.message : "";
  // Lọc lấy tối đa 4 chuỗi lỗi validation từ server để tránh làm rối giao diện form
  const details = Array.isArray(responseData?.errors)
    ? responseData.errors
        .filter((item) => typeof item === "string")
        .slice(0, 4)
    : [];

  // Trường hợp mất mạng hoặc không kết nối được tới Backend
  if (!error?.response) {
    return {
      message: "Không thể kết nối đến máy chủ. Vui lòng kiểm tra kết nối và thử lại.",
      details: [],
    };
  }

  // Phân loại thông báo rõ ràng theo từng mã lỗi HTTP xác thực
  if (statusCode === 400) {
    return {
      message: apiMessage || "Dữ liệu đăng nhập không hợp lệ.",
      details,
    };
  }

  if (statusCode === 401) {
    return {
      message: apiMessage || "Email hoặc mật khẩu không chính xác.",
      details: [],
    };
  }

  if (statusCode === 403) {
    return {
      message: apiMessage || "Tài khoản đã bị vô hiệu hóa.",
      details: [],
    };
  }

  if (statusCode === 429) {
    return {
      message: "Bạn đã thử đăng nhập quá nhiều lần. Vui lòng thử lại sau.",
      details: [],
    };
  }

  return {
    message: "Hệ thống đang gặp sự cố. Vui lòng thử lại sau.",
    details: [],
  };
}
