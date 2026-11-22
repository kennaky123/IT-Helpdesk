import { isValidId } from "../config/database.js";
import { USER_ROLES } from "../models/User.js";
import ApiError from "../utils/ApiError.js";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^[0-9+().\s-]{8,20}$/;

function validatePassword(password, required) {
  if (!password && !required) return [];
  const errors = [];
  if (typeof password !== "string" || password.length < 8) errors.push("Mật khẩu phải có ít nhất 8 ký tự.");
  if (typeof password === "string" && Buffer.byteLength(password, "utf8") > 72) errors.push("Mật khẩu không được vượt quá 72 byte.");
  if (typeof password === "string" && !/[a-z]/.test(password)) errors.push("Mật khẩu phải có ít nhất một chữ thường.");
  if (typeof password === "string" && !/[A-Z]/.test(password)) errors.push("Mật khẩu phải có ít nhất một chữ hoa.");
  if (typeof password === "string" && !/\d/.test(password)) errors.push("Mật khẩu phải có ít nhất một chữ số.");
  return errors;
}

function reject(errors, next) {
  return errors.length
    ? next(new ApiError(400, "Dữ liệu đầu vào không hợp lệ.", errors))
    : next();
}

function normalizeUserStatus(rawStatus) {
  if (rawStatus === "locked" || rawStatus === "inactive") return "inactive";
  if (rawStatus === "active") return "active";
  return null;
}

export function validateObjectId(parameterName) {
  return (request, _response, next) => {
    if (!isValidId(request.params[parameterName])) {
      return next(new ApiError(400, "Mã định danh không hợp lệ."));
    }
    return next();
  };
}

export function validateAdminUser(request, _response, next) {
  const body = request.body ?? {};
  const errors = [];
  const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  const department = typeof body.department === "string" ? body.department.trim() : "";
  const role = typeof body.role === "string" ? body.role.trim() : "user";
  const status = normalizeUserStatus(body.status ?? "active");

  if (fullName.length < 2 || fullName.length > 100) {
    errors.push("Họ tên phải có từ 2 đến 100 ký tự.");
  }
  if (!emailPattern.test(email) || email.length > 254) {
    errors.push("Email không đúng định dạng.");
  }
  if (phone && !phonePattern.test(phone)) {
    errors.push("Số điện thoại không đúng định dạng.");
  }
  if (department.length > 100) {
    errors.push("Phòng ban không được vượt quá 100 ký tự.");
  }
  if (!USER_ROLES.includes(role)) {
    errors.push("Vai trò người dùng không hợp lệ.");
  }
  if (!status) {
    errors.push("Trạng thái tài khoản không hợp lệ.");
  }
  errors.push(...validatePassword(body.password, request.method === "POST"));

  request.body = {
    fullName,
    email,
    phone: phone || null,
    department: department || null,
    role,
    status: status ?? "active",
    password: body.password || null,
  };
  return reject(errors, next);
}

export function validateAdminUserStatus(request, _response, next) {
  const status = normalizeUserStatus(request.body?.status);
  if (!status) {
    return next(new ApiError(400, "Trạng thái tài khoản không hợp lệ."));
  }
  request.body = { status };
  return next();
}

export function validateTechnician(request, _response, next) {
  const body = request.body ?? {};
  const errors = [];
  const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  const specialization = typeof body.specialization === "string" ? body.specialization.trim() : "";

  if (fullName.length < 2 || fullName.length > 100) errors.push("Họ tên phải có từ 2 đến 100 ký tự.");
  if (!emailPattern.test(email) || email.length > 254) errors.push("Email không đúng định dạng.");
  if (phone && !phonePattern.test(phone)) errors.push("Số điện thoại không đúng định dạng.");
  if (specialization.length < 2 || specialization.length > 100) errors.push("Chuyên môn phải có từ 2 đến 100 ký tự.");
  if (!["online", "busy", "offline"].includes(body.status)) errors.push("Trạng thái kỹ thuật viên không hợp lệ.");
  errors.push(...validatePassword(body.password, request.method === "POST"));

  request.body = { fullName, email, phone: phone || null, specialization, status: body.status, password: body.password || null };
  return reject(errors, next);
}

export function validateCategory(request, _response, next) {
  const body = request.body ?? {};
  const errors = [];
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  if (name.length < 2 || name.length > 100) errors.push("Tên danh mục phải có từ 2 đến 100 ký tự.");
  if (description.length > 500) errors.push("Mô tả danh mục không được vượt quá 500 ký tự.");
  if (body.isActive !== undefined && typeof body.isActive !== "boolean") errors.push("Trạng thái danh mục không hợp lệ.");
  request.body = { name, description: description || null, isActive: body.isActive ?? true };
  return reject(errors, next);
}
