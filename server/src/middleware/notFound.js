/**
 * @file notFound.js
 * @description Middleware xử lý các request không khớp với bất kỳ route nào đã đăng ký (HTTP 404).
 * Vai trò trong kiến trúc Backend:
 * - Đứng ngay sau `apiRouter` và trước `errorHandler` trong `app.js` để chuyển đổi route lạ thành `ApiError(404)`.
 */
import ApiError from "../utils/ApiError.js";

/**
 * Tạo đối tượng lỗi 404 kèm thông tin phương thức và đường dẫn được gọi, rồi chuyển sang `errorHandler`.
 * @param {import("express").Request} request - Đối tượng HTTP request.
 * @param {import("express").Response} _response - Đối tượng HTTP response (không dùng).
 * @param {import("express").NextFunction} next - Hàm chuyển tiếp lỗi sang middleware xử lý lỗi tập trung.
 * @returns {void}
 */
export function notFound(request, _response, next) {
  return next(
    new ApiError(
      404,
      `Không tìm thấy endpoint ${request.method} ${request.originalUrl}.`,
    ),
  );
}
