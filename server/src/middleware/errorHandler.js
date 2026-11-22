/**
 * @file errorHandler.js
 * @description Middleware xử lý lỗi tập trung ở cuối chuỗi middleware của Express.
 * Vai trò trong kiến trúc Backend:
 * - Bắt toàn bộ lỗi đồng bộ/bất đồng bộ được chuyển qua `next(error)` từ route, middleware, validator hoặc database.
 * - Chuẩn hóa các lỗi kỹ thuật (Multer, JSON syntax, payload quá lớn, ValidationError, CastError, trùng khóa 11000, VersionError)
 *   thành mã HTTP status và cấu trúc JSON thống nhất `{ success: false, message, data: null }`.
 */
import multer from "multer";
import { env } from "../config/env.js";

/**
 * Middleware xử lý lỗi chuẩn 4 tham số của Express.
 * Luồng xử lý:
 * 1. Nếu headers đã được gửi về client, ủy quyền lại cho Express xử lý mặc định.
 * 2. Ánh xạ từng loại lỗi chuyên biệt (Multer, JSON parse, Payload size, Schema validation,
 *    Unique constraint, Optimistic locking conflict) sang HTTP status code và thông báo tiếng Việt phù hợp.
 * 3. Đảm bảo status code hợp lệ trong khoảng 400–599 và ghi log lỗi (trừ môi trường test).
 * 4. Ẩn thông báo lỗi nội bộ (500) ở production và chỉ đính kèm stack trace ở môi trường development.
 * @param {Error & {statusCode?: number, status?: number, code?: string|number, details?: *, type?: string, errors?: Object, path?: string}} error - Đối tượng lỗi phát sinh.
 * @param {import("express").Request} _request - Đối tượng HTTP request (không dùng).
 * @param {import("express").Response} response - Đối tượng HTTP response.
 * @param {import("express").NextFunction} _next - Hàm next của Express (bắt buộc giữ đủ 4 tham số để Express nhận diện error middleware).
 * @returns {import("express").Response|void}
 */
export function errorHandler(error, _request, response, _next) {
  // Nếu response đã bắt đầu gửi stream/headers thì chuyển tiếp cho Express đóng kết nối an toàn
  if (response.headersSent) {
    return _next(error);
  }

  const errorStatus = error.statusCode ?? error.status;
  let statusCode = Number.isInteger(errorStatus) ? errorStatus : 500;
  let message = error.message || "Đã xảy ra lỗi máy chủ.";
  let details = error.details ?? null;

  // Chuẩn hóa các lỗi phát sinh từ thư viện Multer khi tải tệp lên
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      statusCode = 413;
      message = `Mỗi ảnh không được vượt quá ${env.maxFileSizeMb} MB.`;
    } else if (
      error.code === "LIMIT_FILE_COUNT" ||
      error.code === "LIMIT_UNEXPECTED_FILE"
    ) {
      statusCode = 400;
      message = `Chỉ được đính kèm tối đa ${env.maxFilesPerTicket} ảnh.`;
    } else {
      statusCode = 400;
      message = "Không thể tải tệp đính kèm. Vui lòng kiểm tra lại tệp.";
    }
  } else if (
    error instanceof SyntaxError &&
    error.status === 400 &&
    Object.hasOwn(error, "body")
  ) {
    // Lỗi phân tích cú pháp JSON từ express.json()
    statusCode = 400;
    message = "Dữ liệu JSON không hợp lệ.";
  } else if (error.type === "entity.too.large") {
    // Payload vượt quá giới hạn kích thước cấu hình ở body parser
    statusCode = 413;
    message = "Dữ liệu gửi lên vượt quá giới hạn cho phép.";
  } else if (error.name === "ValidationError") {
    // Lỗi kiểm tra dữ liệu từ Schema layer trong database.js
    statusCode = 400;
    message = "Dữ liệu không hợp lệ.";
    details = Object.values(error.errors ?? {}).map(
      (validationError) => validationError.message,
    );
  } else if (error.name === "CastError") {
    statusCode = 400;
    message = `Giá trị của trường ${error.path} không hợp lệ.`;
  } else if (error.code === 11000) {
    // Lỗi trùng khóa duy nhất (PostgreSQL 23505 được map sang 11000 trong database.js)
    statusCode = 409;
    message = "Dữ liệu đã tồn tại trong hệ thống.";
  } else if (error.name === "VersionError") {
    // Lỗi xung đột cập nhật đồng thời (Optimistic Concurrency Control)
    statusCode = 409;
    message = "Dữ liệu vừa được cập nhật. Vui lòng tải lại và thử lại.";
  }

  // Bảo vệ phòng trường hợp lỗi mang mã trạng thái không thuộc nhóm lỗi HTTP 4xx/5xx
  if (statusCode < 400 || statusCode > 599) {
    statusCode = 500;
  }

  if (env.nodeEnv !== "test") {
    console.error(error);
  }

  // Đóng gói response lỗi chuẩn hóa; che giấu chi tiết nội bộ ở production và hiện stack ở development
  const responseBody = {
    success: false,
    message:
      statusCode === 500 && env.nodeEnv === "production"
        ? "Đã xảy ra lỗi máy chủ."
        : message,
    data: null,
    ...(details && { errors: details }),
    ...(env.nodeEnv === "development" && { stack: error.stack }),
  };

  return response.status(statusCode).json(responseBody);
}
