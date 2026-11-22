/**
 * @file authController.js
 * @description Controller xử lý xác thực (Authentication) và quản lý hồ sơ cá nhân người dùng.
 * Vai trò Controller: Tiếp nhận HTTP request đăng ký, đăng nhập, lấy thông tin phiên hiện tại,
 * đổi mật khẩu, cập nhật hồ sơ/ảnh đại diện và trả về JWT access token hoặc tệp ảnh đại diện.
 */
import { env } from "../config/env.js";
import { unlink } from "node:fs/promises";
import { getUploadedFilePath, removeUploadedFiles } from "../config/upload.js";
import User from "../models/User.js";
import ApiError from "../utils/ApiError.js";
import { generateAccessToken } from "../utils/generateAccessToken.js";

/**
 * Đóng gói dữ liệu người dùng và JWT access token trả về cho client sau khi xác thực thành công.
 *
 * @param {import("mongoose").Document} user - Document tài khoản người dùng.
 * @returns {{user: Object, accessToken: string, tokenType: string, expiresIn: string}} Payload xác thực chuẩn.
 */
function buildAuthenticationData(user) {
  return {
    user: user.toJSON(),
    accessToken: generateAccessToken(user),
    tokenType: "Bearer",
    expiresIn: env.jwtAccessExpiresIn,
  };
}

/**
 * Đăng ký tài khoản người dùng mới (mặc định vai trò `user`, trạng thái `active`).
 *
 * @param {import("express").Request} request - HTTP request chứa thông tin đăng ký trong `body`.
 * @param {import("express").Response} response - HTTP response trả về tài khoản và access token.
 * @param {import("express").NextFunction} next - Middleware chuyển tiếp lỗi.
 * @returns {Promise<import("express").Response|void>} JSON response HTTP 201 khi đăng ký thành công.
 */
export async function register(request, response, next) {
  try {
    const { fullName, email, password, phone, department, avatar } =
      request.body;

    // Kiểm tra email đã tồn tại để trả về lỗi xung đột sớm
    const existingUser = await User.exists({ email });

    if (existingUser) {
      throw new ApiError(409, "Email đã được sử dụng.");
    }

    // Tạo user mới với quyền hạn mặc định thấp nhất ("user") để đảm bảo an toàn phân quyền
    const user = await User.create({
      fullName,
      email,
      password,
      phone,
      department,
      avatar,
      role: "user",
      status: "active",
    });

    return response.status(201).json({
      success: true,
      message: "Đăng ký tài khoản thành công.",
      data: buildAuthenticationData(user),
    });
  } catch (error) {
    // Xử lý trường hợp race condition ghi trùng unique index email trong MongoDB
    if (error.code === 11000) {
      return next(new ApiError(409, "Email đã được sử dụng."));
    }

    return next(error);
  }
}

/**
 * Xác thực đăng nhập bằng email và mật khẩu, đồng thời cấp JWT access token.
 *
 * @param {import("express").Request} request - HTTP request chứa `{ email, password }`.
 * @param {import("express").Response} response - HTTP response trả về thông tin phiên đăng nhập.
 * @param {import("express").NextFunction} next - Middleware chuyển tiếp lỗi.
 * @returns {Promise<import("express").Response|void>} JSON response HTTP 200 khi đăng nhập hợp lệ.
 */
export async function login(request, response, next) {
  try {
    const { email, password } = request.body;
    // Chủ động select thêm password (ẩn mặc định) và tokenVersion để kiểm tra và tạo JWT
    const user = await User.findOne({ email }).select(
      "+password +tokenVersion",
    );

    const passwordIsCorrect = user
      ? await user.comparePassword(password)
      : false;

    if (!user || !passwordIsCorrect) {
      throw new ApiError(401, "Email hoặc mật khẩu không chính xác.");
    }

    // Từ chối đăng nhập nếu tài khoản đã bị Admin vô hiệu hóa
    if (user.status !== "active") {
      throw new ApiError(403, "Tài khoản đã bị vô hiệu hóa.");
    }

    // Ghi nhận mốc thời gian đăng nhập gần nhất mà không chạy lại validator mật khẩu
    user.lastLoginAt = new Date();
    await user.save({ validateBeforeSave: false });

    return response.status(200).json({
      success: true,
      message: "Đăng nhập thành công.",
      data: buildAuthenticationData(user),
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Lấy thông tin tài khoản của người dùng đang đăng nhập từ token hiện tại.
 *
 * @param {import("express").Request} request - HTTP request đã được middleware auth gắn `request.user`.
 * @param {import("express").Response} response - HTTP response trả về thông tin user hiện tại.
 * @param {import("express").NextFunction} next - Middleware chuyển tiếp lỗi.
 * @returns {Promise<import("express").Response|void>} JSON response HTTP 200.
 */
export async function getCurrentUser(request, response, next) {
  try {
    return response.status(200).json({
      success: true,
      message: "Lấy thông tin tài khoản thành công.",
      data: {
        user: request.user.toJSON(),
      },
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Đổi mật khẩu của người dùng đang đăng nhập và vô hiệu hóa toàn bộ token cũ.
 *
 * @param {import("express").Request} request - HTTP request chứa `{ currentPassword, newPassword }`.
 * @param {import("express").Response} response - HTTP response trả về dữ liệu xác thực và token mới.
 * @param {import("express").NextFunction} next - Middleware chuyển tiếp lỗi.
 * @returns {Promise<import("express").Response|void>} JSON response HTTP 200 sau khi đổi mật khẩu.
 */
export async function changePassword(request, response, next) {
  try {
    const { currentPassword, newPassword } = request.body;
    const user = await User.findById(request.user._id).select(
      "+password +passwordChangedAt +tokenVersion",
    );

    if (!user) {
      throw new ApiError(404, "Không tìm thấy tài khoản.");
    }

    // Xác minh mật khẩu hiện tại trước khi cho phép đặt mật khẩu mới
    const currentPasswordIsCorrect =
      await user.comparePassword(currentPassword);

    if (!currentPasswordIsCorrect) {
      throw new ApiError(400, "Mật khẩu hiện tại không chính xác.");
    }

    // Cập nhật mật khẩu, thời điểm đổi mật khẩu và tăng tokenVersion để thu hồi token cũ
    user.password = newPassword;
    user.passwordChangedAt = new Date();
    user.tokenVersion = (user.tokenVersion ?? 0) + 1;
    await user.save();

    return response.status(200).json({
      success: true,
      message: "Đổi mật khẩu thành công.",
      data: buildAuthenticationData(user),
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Cập nhật thông tin hồ sơ cá nhân (`fullName`, `phone`, `department`) của người dùng hiện tại.
 *
 * @param {import("express").Request} request - HTTP request chứa thông tin hồ sơ cần cập nhật.
 * @param {import("express").Response} response - HTTP response trả về dữ liệu tài khoản mới nhất.
 * @param {import("express").NextFunction} next - Middleware chuyển tiếp lỗi.
 * @returns {Promise<import("express").Response|void>} JSON response HTTP 200.
 */
export async function updateProfile(request, response, next) {
  try {
    const { fullName, phone, department } = request.body;
    const user = await User.findById(request.user._id);

    if (!user) {
      throw new ApiError(404, "Không tìm thấy tài khoản.");
    }

    user.fullName = fullName;
    user.phone = phone;
    user.department = department;

    await user.save();

    return response.status(200).json({
      success: true,
      message: "Cập nhật thông tin cá nhân thành công.",
      data: buildAuthenticationData(user),
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Cập nhật ảnh đại diện mới cho người dùng đang đăng nhập và dọn dẹp tệp ảnh cũ trên đĩa.
 *
 * @param {import("express").Request} request - HTTP request chứa tệp tải lên trong `request.file`.
 * @param {import("express").Response} response - HTTP response trả về dữ liệu user kèm tên avatar mới.
 * @param {import("express").NextFunction} next - Middleware chuyển tiếp lỗi.
 * @returns {Promise<import("express").Response|void>} JSON response HTTP 200 khi cập nhật thành công.
 */
export async function updateAvatar(request, response, next) {
  try {
    if (!request.file) {
      throw new ApiError(400, "Vui lòng chọn tệp ảnh đại diện.");
    }

    const user = await User.findById(request.user._id);

    if (!user) {
      throw new ApiError(404, "Không tìm thấy tài khoản.");
    }

    // Lưu lại tên ảnh cũ để xóa khỏi thư mục upload sau khi lưu DB thành công
    const previousAvatar = user.avatar;
    user.avatar = request.file.filename;
    await user.save();

    if (previousAvatar && previousAvatar !== user.avatar) {
      try {
        await unlink(getUploadedFilePath(previousAvatar));
      } catch {
        // Ảnh cũ có thể là URL bên ngoài hoặc đã được dọn trước đó.
      }
    }

    return response.status(200).json({
      success: true,
      message: "Cập nhật ảnh đại diện thành công.",
      data: buildAuthenticationData(user),
    });
  } catch (error) {
    // Dọn dẹp tệp vừa tải lên nếu quá trình lưu DB thất bại để tránh rác ổ đĩa
    if (request.file) await removeUploadedFiles([request.file]);
    return next(error);
  }
}

/**
 * Phục vụ tệp ảnh đại diện từ thư mục lưu trữ nội bộ sau khi xác minh tồn tại trong DB.
 *
 * @param {import("express").Request} request - HTTP request chứa `params.filename`.
 * @param {import("express").Response} response - HTTP response truyền trực tiếp tệp ảnh qua `sendFile`.
 * @param {import("express").NextFunction} next - Middleware chuyển tiếp lỗi.
 * @returns {Promise<void>} Gửi tệp ảnh hoặc chuyển lỗi cho middleware xử lý.
 */
export async function getAvatar(request, response, next) {
  try {
    // Chỉ cho phép truy xuất tệp thực sự được gắn làm avatar của một tài khoản hợp lệ
    const avatarExists = await User.exists({ avatar: request.params.filename });
    if (!avatarExists) throw new ApiError(404, "Không tìm thấy ảnh đại diện.");
    const filePath = getUploadedFilePath(request.params.filename);
    return response.sendFile(filePath, (error) => {
      if (error) {
        next(error);
      }
    });
  } catch (error) {
    return next(error);
  }
}
