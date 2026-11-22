/**
 * @file authorizeRoles.js
 * @description Middleware kiểm soát quyền truy cập theo vai trò (RBAC - Role-Based Access Control).
 * Vai trò trong kiến trúc Backend:
 * - Được đặt sau middleware `authenticate` trên các route cần giới hạn theo nhóm quyền (`admin`, `technician`, `user`).
 * - Kiểm tra cấu hình vai trò hợp lệ ngay lúc khởi tạo route để phát hiện sớm lỗi lập trình.
 */
import { USER_ROLES } from "../models/User.js";
import ApiError from "../utils/ApiError.js";

/**
 * Hàm tạo middleware phân quyền dựa trên danh sách vai trò được phép (`allowedRoles`).
 * Luồng xử lý:
 * 1. Lúc định nghĩa route: Xác thực không có vai trò lạ ngoài `USER_ROLES` và danh sách không rỗng.
 * 2. Lúc xử lý request: Kiểm tra `request.user` tồn tại (401 nếu chưa đăng nhập) và `request.user.role`
 *    thuộc `allowedRoles` (403 nếu không đủ quyền).
 * @param {...string} allowedRoles - Danh sách vai trò được phép truy cập route.
 * @throws {Error} Ném lỗi hệ thống nếu cấu hình `allowedRoles` rỗng hoặc chứa role không hợp lệ.
 * @returns {import("express").RequestHandler} Express middleware thực thi kiểm tra RBAC.
 */
export function authorizeRoles(...allowedRoles) {
  // Kiểm tra ngay lúc đăng ký route để tránh gõ sai tên role dẫn đến lỗ hổng phân quyền
  const invalidRoles = allowedRoles.filter(
    (role) => !USER_ROLES.includes(role),
  );

  if (allowedRoles.length === 0 || invalidRoles.length > 0) {
    throw new Error("Cấu hình role middleware không hợp lệ.");
  }

  return function roleMiddleware(request, _response, next) {
    // Yêu cầu phải có thông tin user đã được gắn bởi middleware authenticate trước đó
    if (!request.user) {
      return next(new ApiError(401, "Bạn chưa đăng nhập."));
    }

    // Từ chối truy cập nếu vai trò hiện tại của người dùng không nằm trong danh sách cho phép
    if (!allowedRoles.includes(request.user.role)) {
      return next(
        new ApiError(403, "Bạn không có quyền thực hiện thao tác này."),
      );
    }

    return next();
  };
}
