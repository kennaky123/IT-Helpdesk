/**
 * @file ApiError.js
 * @description Định nghĩa lớp lỗi chuẩn `ApiError` dùng trong toàn bộ hệ thống IT Helpdesk Backend.
 * Vai trò trong kiến trúc Backend:
 * - Cho phép các controller, service và middleware ném lỗi có kiểm soát kèm mã HTTP status và dữ liệu chi tiết.
 * - Được `errorHandler` nhận diện để trả về response JSON thống nhất cho client.
 */

/**
 * Lớp ngoại lệ tùy chỉnh đại diện cho các lỗi nghiệp vụ/HTTP có chủ đích (operational errors).
 * @extends Error
 */
class ApiError extends Error {
  /**
   * Khởi tạo đối tượng lỗi API.
   * @param {number} statusCode - Mã trạng thái HTTP (ví dụ: 400, 401, 403, 404, 409).
   * @param {string} message - Thông điệp lỗi trả về cho người dùng/client.
   * @param {*|null} [details=null] - Thông tin chi tiết bổ sung (ví dụ: danh sách lỗi validation từng trường).
   */
  constructor(statusCode, message, details = null) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.details = details;
    // Đánh dấu đây là lỗi nghiệp vụ dự kiến trước, phân biệt với lỗi hệ thống bất ngờ
    this.isOperational = true;
    // Ghi nhận stack trace sạch, loại bỏ khung gọi constructor của chính ApiError
    Error.captureStackTrace(this, this.constructor);
  }
}

export default ApiError;
