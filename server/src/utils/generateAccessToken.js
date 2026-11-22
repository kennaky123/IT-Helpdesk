/**
 * @file generateAccessToken.js
 * @description Tiện ích khởi tạo JWT Access Token cho người dùng sau khi xác thực thành công.
 * Vai trò trong kiến trúc Backend:
 * - Đóng gói thông tin danh tính, vai trò (`role`) và `tokenVersion` vào token ký bằng thuật toán HS256.
 * - Xuất các hằng số `ACCESS_TOKEN_ISSUER` và `ACCESS_TOKEN_AUDIENCE` để middleware `authenticate` đối chiếu nhất quán.
 */
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

/** Định danh bên phát hành JWT Access Token của hệ thống. */
export const ACCESS_TOKEN_ISSUER = "it-helpdesk-api";
/** Định danh đối tượng client được phép sử dụng JWT Access Token. */
export const ACCESS_TOKEN_AUDIENCE = "it-helpdesk-client";

/**
 * Tạo chuỗi JWT Access Token cho một tài khoản người dùng.
 * Luồng xử lý:
 * - Đưa `role` và `tokenVersion` (mặc định 0) vào payload để hỗ trợ phân quyền và thu hồi phiên đăng nhập.
 * - Ký token bằng `env.jwtAccessSecret` với thuật toán `HS256`, gán `subject` là ID người dùng
 *   cùng `issuer`, `audience` và thời hạn `expiresIn`.
 * @param {{ _id: string|{toString(): string}, role: string, tokenVersion?: number }} user - Đối tượng người dùng đã xác thực.
 * @returns {string} Chuỗi JWT Access Token đã ký.
 */
export function generateAccessToken(user) {
  return jwt.sign(
    {
      role: user.role,
      // Lưu tokenVersion để vô hiệu hóa toàn bộ phiên cũ khi admin thu hồi hoặc user đổi mật khẩu/đăng xuất tất cả
      tokenVersion: user.tokenVersion ?? 0,
    },
    env.jwtAccessSecret,
    {
      algorithm: "HS256",
      subject: user._id.toString(),
      issuer: ACCESS_TOKEN_ISSUER,
      audience: ACCESS_TOKEN_AUDIENCE,
      expiresIn: env.jwtAccessExpiresIn,
    },
  );
}
