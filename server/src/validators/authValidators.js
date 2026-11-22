/**
 * @file authValidators.js
 * @description Bộ middleware kiểm tra và chuẩn hóa dữ liệu đầu vào cho xác thực và hồ sơ cá nhân.
 * Vai trò trong kiến trúc Backend: Thuộc tầng Validator (Express Middleware Validator), đứng trước
 * `authController` để bảo vệ các endpoint đăng ký, đăng nhập, đổi mật khẩu và cập nhật thông tin cá nhân,
 * đồng thời chặn các lỗi bảo mật như tự nâng quyền (`role`/`status`) khi đăng ký hoặc vượt quá 72 byte bcrypt.
 */
import ApiError from "../utils/ApiError.js";

// Biểu thức chính quy kiểm tra email và số điện thoại hợp lệ
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^[0-9+().\s-]{8,20}$/;

/**
 * Hàm phụ trợ kiểm tra độ phức tạp mật khẩu theo chính sách bảo mật.
 * @param {unknown} password - Mật khẩu cần kiểm tra.
 * @param {string} [fieldName="Mật khẩu"] - Tên trường hiển thị trong thông báo lỗi.
 * @returns {string[]} Danh sách lỗi phát hiện được.
 */
function validatePassword(password, fieldName = "Mật khẩu") {
  const errors = [];

  if (typeof password !== "string" || password.length === 0) {
    return [`${fieldName} là bắt buộc.`];
  }

  if (password.length < 8) {
    errors.push(`${fieldName} phải có ít nhất 8 ký tự.`);
  }

  // Giới hạn 72 byte vì thuật toán bcrypt sẽ cắt bỏ phần vượt quá 72 byte
  if (Buffer.byteLength(password, "utf8") > 72) {
    errors.push(`${fieldName} không được vượt quá 72 byte.`);
  }

  // Yêu cầu mật khẩu mạnh gồm chữ thường, chữ hoa và chữ số
  if (!/[a-z]/.test(password)) {
    errors.push(`${fieldName} phải có ít nhất một chữ thường.`);
  }

  if (!/[A-Z]/.test(password)) {
    errors.push(`${fieldName} phải có ít nhất một chữ hoa.`);
  }

  if (!/\d/.test(password)) {
    errors.push(`${fieldName} phải có ít nhất một chữ số.`);
  }

  return errors;
}

/**
 * Hàm phụ trợ chuyển tiếp `ApiError(400)` nếu có lỗi validation hoặc cho phép đi tiếp tới controller.
 */
function rejectInvalidInput(errors, next) {
  if (errors.length > 0) {
    return next(
      new ApiError(400, "Dữ liệu đầu vào không hợp lệ.", errors),
    );
  }

  return next();
}

/**
 * Middleware validate dữ liệu đăng ký tài khoản mới (`POST /api/auth/register`).
 * Kiểm tra fullName, email, mật khẩu mạnh, phone/department/avatar tùy chọn, và chặn người dùng tự truyền `role` hoặc `status`.
 */
export function validateRegister(request, _response, next) {
  try {
    const body = request.body ?? {};
    const errors = [];

    const fullName =
      typeof body.fullName === "string" ? body.fullName.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim() : "";

    if (fullName.length < 2 || fullName.length > 100) {
      errors.push("Họ tên phải có từ 2 đến 100 ký tự.");
    }

    if (!emailPattern.test(email) || email.length > 254) {
      errors.push("Email không đúng định dạng.");
    }

    errors.push(...validatePassword(body.password));

    // Kiểm tra số điện thoại nếu người dùng có cung cấp
    if (body.phone !== undefined && body.phone !== null && body.phone !== "") {
      if (typeof body.phone !== "string" || !phonePattern.test(body.phone.trim())) {
        errors.push("Số điện thoại không đúng định dạng.");
      }
    }

    if (
      body.department !== undefined &&
      body.department !== null &&
      (typeof body.department !== "string" ||
        body.department.trim().length > 100)
    ) {
      errors.push("Phòng ban không được vượt quá 100 ký tự.");
    }

    if (
      body.avatar !== undefined &&
      body.avatar !== null &&
      (typeof body.avatar !== "string" || body.avatar.trim().length > 500)
    ) {
      errors.push("Đường dẫn ảnh đại diện không được vượt quá 500 ký tự.");
    }

    // Chốt chặn bảo mật chống leo thang đặc quyền (Privilege Escalation) khi tự đăng ký
    if (Object.hasOwn(body, "role") || Object.hasOwn(body, "status")) {
      errors.push("Không được tự chỉ định vai trò hoặc trạng thái tài khoản.");
    }

    // Chuẩn hóa email về chữ thường và trim khoảng trắng các trường chuỗi
    request.body = {
      ...body,
      fullName,
      email: email.toLowerCase(),
      phone: typeof body.phone === "string" ? body.phone.trim() || null : null,
      department:
        typeof body.department === "string"
          ? body.department.trim() || null
          : null,
      avatar:
        typeof body.avatar === "string" ? body.avatar.trim() || null : null,
    };

    return rejectInvalidInput(errors, next);
  } catch (error) {
    return next(error);
  }
}

/**
 * Middleware validate thông tin đăng nhập (`POST /api/auth/login`).
 * Quy tắc: Bắt buộc email đúng định dạng và mật khẩu không rỗng, đồng thời chuẩn hóa email chữ thường.
 */
export function validateLogin(request, _response, next) {
  try {
    const body = request.body ?? {};
    const errors = [];
    const email = typeof body.email === "string" ? body.email.trim() : "";

    if (!emailPattern.test(email) || email.length > 254) {
      errors.push("Email không đúng định dạng.");
    }

    if (typeof body.password !== "string" || body.password.length === 0) {
      errors.push("Mật khẩu là bắt buộc.");
    }

    request.body = {
      ...body,
      email: email.toLowerCase(),
    };

    return rejectInvalidInput(errors, next);
  } catch (error) {
    return next(error);
  }
}

/**
 * Middleware validate dữ liệu đổi mật khẩu (`PATCH /api/auth/change-password`).
 * Quy tắc: Bắt buộc `currentPassword`, `newPassword` đạt chuẩn mật khẩu mạnh, khớp với `confirmNewPassword` và khác mật khẩu cũ.
 */
export function validateChangePassword(request, _response, next) {
  try {
    const body = request.body ?? {};
    const errors = [];

    if (
      typeof body.currentPassword !== "string" ||
      body.currentPassword.length === 0
    ) {
      errors.push("Mật khẩu hiện tại là bắt buộc.");
    }

    errors.push(...validatePassword(body.newPassword, "Mật khẩu mới"));

    if (body.newPassword !== body.confirmNewPassword) {
      errors.push("Xác nhận mật khẩu mới không khớp.");
    }

    if (
      typeof body.currentPassword === "string" &&
      body.currentPassword === body.newPassword
    ) {
      errors.push("Mật khẩu mới phải khác mật khẩu hiện tại.");
    }

    return rejectInvalidInput(errors, next);
  } catch (error) {
    return next(error);
  }
}

/**
 * Middleware validate cập nhật thông tin hồ sơ cá nhân (`PATCH /api/auth/profile`).
 * Quy tắc: Bắt buộc `fullName` (2-100 ký tự), kiểm tra định dạng `phone` và độ dài `department`;
 * lọc bỏ mọi trường không được phép sửa như `role`, `email`, `status`.
 */
export function validateUpdateProfile(request, _response, next) {
  try {
    const body = request.body ?? {};
    const errors = [];

    const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
    if (fullName.length < 2 || fullName.length > 100) {
      errors.push("Họ tên phải có từ 2 đến 100 ký tự.");
    }

    if (body.phone !== undefined && body.phone !== null && body.phone !== "") {
      if (typeof body.phone !== "string" || !phonePattern.test(body.phone.trim())) {
        errors.push("Số điện thoại không đúng định dạng.");
      }
    }

    if (
      body.department !== undefined &&
      body.department !== null &&
      (typeof body.department !== "string" || body.department.trim().length > 100)
    ) {
      errors.push("Phòng ban không được vượt quá 100 ký tự.");
    }

    // Chỉ giữ lại 3 trường hồ sơ hợp lệ để tránh Mass Assignment
    request.body = {
      fullName,
      phone: typeof body.phone === "string" ? body.phone.trim() || null : null,
      department: typeof body.department === "string" ? body.department.trim() || null : null,
    };

    return rejectInvalidInput(errors, next);
  } catch (error) {
    return next(error);
  }
}
