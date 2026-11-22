/**
 * @file adminService.js
 * @description Service quản trị hệ thống: quản lý người dùng, kỹ thuật viên và danh mục sự cố.
 * Vai trò trong kiến trúc Frontend: Thuộc tầng API Services, giao tiếp với Backend qua `axiosClient`,
 * chuyển đổi cấu trúc dữ liệu giữa API và UI Admin (mapping trường, chuẩn hóa trạng thái)
 * và định dạng thông báo lỗi quản trị.
 */
import axiosClient from "../api/axiosClient.js";

/**
 * Tạo đối tượng lỗi chuẩn hóa khi cấu trúc phản hồi từ API quản trị không hợp lệ.
 *
 * @param {string} message - Thông điệp lỗi chi tiết.
 * @returns {Error & { code: string }} Lỗi gắn mã `"INVALID_ADMIN_RESPONSE"`.
 */
function invalid(message) {
  const error = new Error(message);
  error.code = "INVALID_ADMIN_RESPONSE";
  return error;
}

/**
 * Ánh xạ bản ghi người dùng thô từ Backend sang định dạng chuẩn cho giao diện Admin.
 *
 * @param {object} user - Dữ liệu người dùng nhận từ API.
 * @returns {object} Đối tượng người dùng đã chuẩn hóa (`id`, `status` active/locked, `ticketCount`...).
 */
function mapAdminUser(user) {
  // Quy đổi các trạng thái khác "active" thành "locked" để hiển thị thống nhất trên bảng quản trị
  return {
    id: user._id,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone ?? "",
    department: user.department ?? "",
    role: user.role,
    status: user.status === "active" ? "active" : "locked",
    ticketCount: Number(user.ticketCount ?? 0),
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
    recentTickets: Array.isArray(user.recentTickets) ? user.recentTickets : [],
  };
}

/**
 * Chuyển đổi dữ liệu form người dùng trên UI sang payload phù hợp với API Backend.
 *
 * @param {object} values - Giá trị form tạo/cập nhật người dùng.
 * @returns {object} Payload gửi lên API (chuyển `"locked"` về `"inactive"` và chỉ đính kèm mật khẩu nếu có).
 */
function toAdminUserPayload(values) {
  // Chỉ gửi trường password khi người dùng có nhập mật khẩu mới (tránh ghi đè rỗng khi cập nhật)
  return {
    fullName: values.fullName,
    email: values.email,
    phone: values.phone ?? "",
    department: values.department ?? "",
    role: values.role,
    status: values.status === "locked" ? "inactive" : values.status,
    ...(values.password ? { password: values.password } : {}),
  };
}

/**
 * Lấy toàn bộ danh sách người dùng phục vụ trang quản trị.
 *
 * @param {{ signal?: AbortSignal }} [options] - Tùy chọn hủy request từ React Query.
 * @returns {Promise<Array<object>>} Mảng người dùng đã ánh xạ sang định dạng UI.
 */
export async function getAdminUsers({ signal } = {}) {
  const users = (await axiosClient.get("/admin/users", { signal })).data?.data?.users;
  if (!Array.isArray(users)) throw invalid("Phản hồi danh sách người dùng không hợp lệ.");
  return users.map(mapAdminUser);
}

/**
 * Tạo mới một tài khoản người dùng từ trang quản trị.
 *
 * @param {object} values - Thông tin người dùng từ form tạo mới.
 * @returns {Promise<object>} Bản ghi người dùng vừa tạo đã chuẩn hóa.
 */
export async function createAdminUser(values) {
  const response = await axiosClient.post("/admin/users", toAdminUserPayload(values));
  return mapAdminUser(response.data?.data?.user);
}

/**
 * Cập nhật thông tin tài khoản người dùng theo ID.
 *
 * @param {string} id - ID người dùng cần chỉnh sửa.
 * @param {object} values - Dữ liệu cập nhật từ form.
 * @returns {Promise<object>} Bản ghi người dùng sau khi cập nhật.
 */
export async function updateAdminUser(id, values) {
  const response = await axiosClient.patch(`/admin/users/${id}`, toAdminUserPayload(values));
  return mapAdminUser(response.data?.data?.user);
}

/**
 * Thay đổi nhanh trạng thái hoạt động (mở khóa / khóa) của tài khoản người dùng.
 *
 * @param {string} id - ID người dùng.
 * @param {"active" | "locked" | "inactive"} status - Trạng thái mục tiêu trên UI hoặc API.
 * @returns {Promise<object>} Bản ghi người dùng với trạng thái mới.
 */
export async function updateAdminUserStatus(id, status) {
  // Quy đổi trạng thái "locked" trên giao diện về "inactive" theo quy ước Backend
  const normalizedStatus = status === "locked" ? "inactive" : status;
  const response = await axiosClient.patch(`/admin/users/${id}/status`, {
    status: normalizedStatus,
  });
  return mapAdminUser(response.data?.data?.user);
}

/**
 * Xóa vĩnh viễn tài khoản người dùng theo ID.
 *
 * @param {string} id - ID người dùng cần xóa.
 * @returns {Promise<void>}
 */
export async function deleteAdminUser(id) {
  await axiosClient.delete(`/admin/users/${id}`);
}

/**
 * Lấy danh sách tất cả danh mục sự cố (bao gồm cả danh mục đang ẩn) cho Admin.
 *
 * @param {{ signal?: AbortSignal }} [options] - Tùy chọn hủy request.
 * @returns {Promise<Array<object>>} Mảng danh mục kèm số lượng ticket và trạng thái kích hoạt.
 */
export async function getAdminCategories({ signal } = {}) {
  const categories = (await axiosClient.get("/categories/admin", { signal })).data?.data?.categories;
  if (!Array.isArray(categories)) throw invalid("Phản hồi danh mục không hợp lệ.");
  // Tạo mã viết tắt 2 chữ cái đầu làm biểu tượng hiển thị cho danh mục
  return categories.map((category) => ({
    id: category._id,
    name: category.name,
    description: category.description ?? "",
    icon: category.name.slice(0, 2).toUpperCase(),
    tickets: Number(category.ticketCount ?? 0),
    active: Boolean(category.isActive),
  }));
}

/**
 * Ánh xạ bản ghi kỹ thuật viên từ Backend sang định dạng hiển thị bảng quản trị.
 *
 * @param {object} technician - Dữ liệu kỹ thuật viên thô từ API.
 * @returns {object} Đối tượng kỹ thuật viên gồm thông tin cá nhân và chỉ số xử lý ticket.
 */
function mapTechnician(technician) {
  return {
    id: technician._id,
    name: technician.fullName,
    email: technician.email,
    phone: technician.phone ?? "",
    specialization: technician.specialization ?? "Chưa cập nhật",
    active: Number(technician.active ?? 0),
    completed: Number(technician.completed ?? 0),
    rating: technician.rating == null ? "—" : technician.rating,
    status: technician.status,
  };
}

/**
 * Ánh xạ bản ghi danh mục sự cố từ API sang cấu trúc UI Admin.
 *
 * @param {object} category - Dữ liệu danh mục thô từ Backend.
 * @returns {object} Đối tượng danh mục chuẩn hóa.
 */
function mapCategory(category) {
  return {
    id: category._id,
    name: category.name,
    description: category.description ?? "",
    icon: category.name.slice(0, 2).toUpperCase(),
    tickets: Number(category.ticketCount ?? 0),
    active: Boolean(category.isActive),
  };
}

/**
 * Lấy danh sách kỹ thuật viên kèm thống kê công việc cho trang quản trị.
 *
 * @param {{ signal?: AbortSignal }} [options] - Tùy chọn hủy request.
 * @returns {Promise<Array<object>>} Mảng kỹ thuật viên đã chuẩn hóa.
 */
export async function getAdminTechnicians({ signal } = {}) {
  const technicians = (await axiosClient.get("/technicians/admin", { signal })).data?.data?.technicians;
  if (!Array.isArray(technicians)) throw invalid("Phản hồi kỹ thuật viên không hợp lệ.");
  return technicians.map(mapTechnician);
}

/**
 * Chuyển đổi dữ liệu form kỹ thuật viên sang payload gửi API Backend.
 *
 * @param {object} values - Dữ liệu từ form tạo/cập nhật kỹ thuật viên.
 * @returns {object} Payload chuẩn hóa (`fullName`, `specialization`, tùy chọn `password`).
 */
function toTechnicianPayload(values) {
  // Chỉ đính kèm password khi người dùng nhập mật khẩu mới
  return {
    fullName: values.name,
    email: values.email,
    phone: values.phone,
    specialization: values.specialization,
    status: values.status,
    ...(values.password && { password: values.password }),
  };
}

/**
 * Tạo mới tài khoản kỹ thuật viên.
 *
 * @param {object} values - Thông tin kỹ thuật viên cần tạo.
 * @returns {Promise<object>} Kỹ thuật viên vừa tạo đã chuẩn hóa.
 */
export async function createAdminTechnician(values) {
  const response = await axiosClient.post("/technicians/admin", toTechnicianPayload(values));
  return mapTechnician(response.data?.data?.technician);
}

/**
 * Cập nhật thông tin kỹ thuật viên theo ID.
 *
 * @param {string} id - ID kỹ thuật viên.
 * @param {object} values - Thông tin mới từ form.
 * @returns {Promise<object>} Kỹ thuật viên sau khi cập nhật.
 */
export async function updateAdminTechnician(id, values) {
  const response = await axiosClient.patch(`/technicians/admin/${id}`, toTechnicianPayload(values));
  return mapTechnician(response.data?.data?.technician);
}

/**
 * Xóa tài khoản kỹ thuật viên theo ID.
 *
 * @param {string} id - ID kỹ thuật viên cần xóa.
 * @returns {Promise<void>}
 */
export async function deleteAdminTechnician(id) {
  await axiosClient.delete(`/technicians/admin/${id}`);
}

/**
 * Tạo mới danh mục sự cố trong trang quản trị.
 *
 * @param {object} values - Thông tin danh mục (`name`, `description`, `active`).
 * @returns {Promise<object>} Danh mục vừa tạo đã chuẩn hóa.
 */
export async function createAdminCategory(values) {
  const response = await axiosClient.post("/categories/admin", {
    name: values.name,
    description: values.description,
    isActive: values.active ?? true,
  });
  return mapCategory(response.data?.data?.category);
}

/**
 * Cập nhật thông tin hoặc trạng thái bật/tắt của danh mục sự cố.
 *
 * @param {string} id - ID danh mục.
 * @param {object} values - Dữ liệu cập nhật (`name`, `description`, `active`).
 * @returns {Promise<object>} Danh mục sau khi cập nhật.
 */
export async function updateAdminCategory(id, values) {
  const response = await axiosClient.patch(`/categories/admin/${id}`, {
    name: values.name,
    description: values.description,
    isActive: values.active,
  });
  return mapCategory(response.data?.data?.category);
}

/**
 * Xóa danh mục sự cố theo ID.
 *
 * @param {string} id - ID danh mục cần xóa.
 * @returns {Promise<void>}
 */
export async function deleteAdminCategory(id) {
  await axiosClient.delete(`/categories/admin/${id}`);
}

/**
 * Chuyển đổi lỗi phát sinh từ các API quản trị thành thông báo tiếng Việt thân thiện.
 *
 * @param {any} error - Đối tượng lỗi từ axios hoặc validator nội bộ.
 * @returns {string} Thông điệp lỗi kèm chi tiết validation đầu tiên (nếu có).
 */
export function getAdminErrorMessage(error) {
  if (!error?.response) return "Không thể kết nối đến máy chủ. Vui lòng thử lại.";
  const details = error.response.data?.details;
  // Ghép thêm chi tiết lỗi đầu tiên nếu server trả về mảng details (validation error)
  if (Array.isArray(details) && details.length > 0) {
    return `${error.response.data?.message ?? "Dữ liệu không hợp lệ."} (${details[0]})`;
  }
  return error.response.data?.message ?? "Không thể tải dữ liệu quản trị.";
}
