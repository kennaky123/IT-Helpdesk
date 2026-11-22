/**
 * @file authenticate.js
 * @description Middleware xác thực người dùng bằng JWT Access Token (Bearer Authentication).
 * Vai trò trong kiến trúc Backend:
 * - Bảo vệ các route yêu cầu đăng nhập bằng cách giải mã JWT từ header `Authorization`.
 * - Xác minh trạng thái tài khoản, `tokenVersion` (chống dùng lại token đã thu hồi) và thời điểm đổi mật khẩu.
 * - Gắn đối tượng `request.user` để các middleware phân quyền và controller phía sau sử dụng.
 */
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import User from "../models/User.js";
import ApiError from "../utils/ApiError.js";
import {
  ACCESS_TOKEN_AUDIENCE,
  ACCESS_TOKEN_ISSUER,
} from "../utils/generateAccessToken.js";

/**
 * Trích xuất chuỗi JWT từ header `Authorization` theo chuẩn `Bearer <token>`.
 * @param {import("express").Request} request - Đối tượng HTTP request.
 * @throws {ApiError} Ném lỗi 401 nếu thiếu header hoặc sai định dạng Bearer.
 * @returns {string} Chuỗi JWT thô.
 */
function extractBearerToken(request) {
  const authorizationHeader = request.get("authorization");

  if (!authorizationHeader) {
    throw new ApiError(401, "Bạn cần đăng nhập để truy cập tài nguyên này.");
  }

  // Tách scheme và token, đồng thời từ chối nếu xuất hiện thêm phần tử thừa
  const [scheme, token, ...extraParts] = authorizationHeader.trim().split(/\s+/);

  if (scheme?.toLowerCase() !== "bearer" || !token || extraParts.length > 0) {
    throw new ApiError(401, "Authorization header không hợp lệ.");
  }

  return token;
}

/**
 * Middleware xác thực JWT Access Token cho mỗi request được bảo vệ.
 * Luồng xử lý:
 * 1. Lấy Bearer token từ header và kiểm tra chữ ký `HS256`, `issuer`, `audience`.
 * 2. Truy vấn bản ghi `User` kèm các trường nhạy cảm `+passwordChangedAt +tokenVersion`.
 * 3. Kiểm tra tài khoản còn tồn tại, đang `active` (403 nếu bị khóa), khớp `tokenVersion`
 *    và chưa đổi mật khẩu sau thời điểm phát hành token (`iat`).
 * 4. Gán `request.user = user` và gọi `next()`; chuyển đổi các lỗi JWT thành `ApiError(401)`.
 * @param {import("express").Request} request - Đối tượng HTTP request.
 * @param {import("express").Response} _response - Đối tượng HTTP response (không dùng).
 * @param {import("express").NextFunction} next - Hàm chuyển tiếp middleware.
 * @returns {Promise<void>}
 */
export async function authenticate(request, _response, next) {
  try {
    const token = extractBearerToken(request);
    // Giải mã và kiểm tra chữ ký, issuer, audience của access token
    const decodedToken = jwt.verify(token, env.jwtAccessSecret, {
      algorithms: ["HS256"],
      issuer: ACCESS_TOKEN_ISSUER,
      audience: ACCESS_TOKEN_AUDIENCE,
    });

    if (!decodedToken.sub) {
      throw new ApiError(401, "Access token không hợp lệ.");
    }

    // Lấy thêm passwordChangedAt và tokenVersion (mặc định bị ẩn) để đối chiếu hiệu lực phiên
    const user = await User.findById(decodedToken.sub).select(
      "+passwordChangedAt +tokenVersion",
    );

    if (!user) {
      throw new ApiError(401, "Tài khoản của access token không còn tồn tại.");
    }

    // Chặn tài khoản đã bị quản trị viên khóa/vô hiệu hóa
    if (user.status !== "active") {
      throw new ApiError(403, "Tài khoản đã bị vô hiệu hóa.");
    }

    // Kiểm tra tokenVersion để vô hiệu hóa các token cũ khi thu hồi phiên đăng nhập
    if ((decodedToken.tokenVersion ?? 0) !== (user.tokenVersion ?? 0)) {
      throw new ApiError(401, "Phiên đăng nhập đã bị thu hồi.");
    }

    // Từ chối token được cấp trước thời điểm người dùng đổi mật khẩu gần nhất
    if (user.changedPasswordAfter(decodedToken.iat)) {
      throw new ApiError(
        401,
        "Mật khẩu đã được thay đổi. Vui lòng đăng nhập lại.",
      );
    }

    request.user = user;
    return next();
  } catch (error) {
    // Chuẩn hóa lỗi hết hạn hoặc sai cấu trúc từ thư viện jsonwebtoken sang HTTP 401
    if (error.name === "TokenExpiredError") {
      return next(
        new ApiError(401, "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại."),
      );
    }

    if (error.name === "JsonWebTokenError") {
      return next(new ApiError(401, "Access token không hợp lệ."));
    }

    return next(error);
  }
}
