/**
 * @file adminValidators.js
 * @description Bộ middleware kiểm tra và chuẩn hóa dữ liệu đầu vào cho các API quản trị (Admin).
 * Vai trò trong kiến trúc Backend: Thuộc tầng Validator (Express Middleware Validator), chạy trước Controller
 * để xác thực ObjectId, dữ liệu tạo/cập nhật người dùng, kỹ thuật viên và danh mục; đẩy `ApiError(400)`
 * sang middleware xử lý lỗi tập trung nếu dữ liệu không hợp lệ.
 */
import { isValidId } from "../config/database.js";
import { USER_ROLES } from "../models/User.js";
import ApiError from "../utils/ApiError.js";

// Biểu thức chính quy kiểm tra định dạng email và số điện thoại hợp lệ
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^[0-9+().\s-]{8,20}$/;

/**
 * Hàm phụ trợ kiểm tra độ mạnh và giới hạn kích thước mật khẩu.
 * @param {unknown} password - Giá trị mật khẩu từ request body.
 * @param {boolean} required - True nếu bắt buộc phải có mật khẩu (ví dụ khi tạo mới qua POST).
 * @returns {string[]} Danh sách thông báo lỗi (mảng rỗng nếu hợp lệ).
 */
function validatePassword(password, required) {
  // Bỏ qua kiểm tra nếu không gửi mật khẩu và không bắt buộc (trường hợp cập nhật PATCH)
  if (!password && !required) return [];
  const errors = [];
  // Kiểm tra độ dài tối thiểu 8 ký tự và giới hạn 72 byte của thuật toán bcrypt
  if (typeof password !== "string" || password.length < 8) errors.push("Mật khẩu phải có ít nhất 8 ký tự.");
  if (typeof password === "string" && Buffer.byteLength(password, "utf8") > 72) errors.push("Mật khẩu không được vượt quá 72 byte.");
  // Bắt buộc có ít nhất 1 chữ thường, 1 chữ hoa và 1 chữ số
  if (typeof password === "string" && !/[a-z]/.test(password)) errors.push("Mật khẩu phải có ít nhất một chữ thường.");
  if (typeof password === "string" && !/[A-Z]/.test(password)) errors.push("Mật khẩu phải có ít nhất một chữ hoa.");
  if (typeof password === "string" && !/\d/.test(password)) errors.push("Mật khẩu phải có ít nhất một chữ số.");
  return errors;
}

/**
 * Hàm phụ trợ điều hướng luồng Express: chuyển `ApiError(400)` nếu có lỗi hoặc gọi `next()` đi tiếp.
 */
function reject(errors, next) {
  return errors.length
    ? next(new ApiError(400, "Dữ liệu đầu vào không hợp lệ.", errors))
    : next();
}

/**
 * Chuẩn hóa chuỗi trạng thái tài khoản từ client (ánh xạ "locked" sang "inactive").
 * @param {unknown} rawStatus - Giá trị trạng thái thô từ request.
 * @returns {"active"|"inactive"|null} Trạng thái hợp lệ hoặc null nếu không hợp lệ.
 */
function normalizeUserStatus(rawStatus) {
  if (rawStatus === "locked" || rawStatus === "inactive") return "inactive";
  if (rawStatus === "active") return "active";
  return null;
}

/**
 * Factory tạo Express middleware kiểm tra tính hợp lệ của tham số `:id` (MongoDB ObjectId) trên URL.
 * @param {string} parameterName - Tên tham số trong `request.params` (ví dụ: `"userId"`, `"categoryId"`).
 * @returns {import("express").RequestHandler} Middleware Express xác thực ObjectId.
 */
export function validateObjectId(parameterName) {
  return (request, _response, next) => {
    if (!isValidId(request.params[parameterName])) {
      return next(new ApiError(400, "Mã định danh không hợp lệ."));
    }
    return next();
  };
}

/**
 * Middleware validate và chuẩn hóa payload khi Admin tạo mới (POST) hoặc cập nhật (PATCH) tài khoản người dùng.
 * Quy tắc: fullName (2-100 ký tự), email chuẩn <= 254 ký tự, phone/department tùy chọn, role thuộc USER_ROLES,
 * status hợp lệ và password bắt buộc khi POST.
 */
export function validateAdminUser(request, _response, next) {
  const body = request.body ?? {};
  const errors = [];
  // Trích xuất và chuẩn hóa khoảng trắng / chữ thường cho các trường chuỗi
  const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  const department = typeof body.department === "string" ? body.department.trim() : "";
  const role = typeof body.role === "string" ? body.role.trim() : "user";
  const status = normalizeUserStatus(body.status ?? "active");

  // Kiểm tra từng ràng buộc dữ liệu đầu vào
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
  // Mật khẩu chỉ bắt buộc khi tạo tài khoản mới (method === "POST")
  errors.push(...validatePassword(body.password, request.method === "POST"));

  // Ghi đè request.body bằng dữ liệu sạch đã chuẩn hóa trước khi chuyển cho controller
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

/**
 * Middleware validate trạng thái tài khoản khi Admin thực hiện khóa hoặc mở khóa người dùng.
 */
export function validateAdminUserStatus(request, _response, next) {
  const status = normalizeUserStatus(request.body?.status);
  if (!status) {
    return next(new ApiError(400, "Trạng thái tài khoản không hợp lệ."));
  }
  request.body = { status };
  return next();
}

/**
 * Middleware validate và chuẩn hóa dữ liệu tạo mới (POST) hoặc cập nhật (PATCH) kỹ thuật viên.
 * Quy tắc: fullName (2-100), email chuẩn, specialization (2-100), status thuộc ["online", "busy", "offline"],
 * và password bắt buộc khi tạo mới.
 */
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

  // Làm sạch request.body chỉ giữ lại các trường cho phép
  request.body = { fullName, email, phone: phone || null, specialization, status: body.status, password: body.password || null };
  return reject(errors, next);
}

/**
 * Middleware validate dữ liệu tạo mới hoặc cập nhật danh mục Ticket.
 * Quy tắc: name (2-100 ký tự), description (tối đa 500 ký tự), isActive kiểu boolean (mặc định true).
 */
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
