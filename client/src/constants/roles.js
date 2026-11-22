/**
 * Định nghĩa các hằng số vai trò (RBAC) và đường dẫn trang chủ mặc định theo vai trò.
 * Vai trò: Chuẩn hóa mã vai trò giữa frontend, route guards và giao diện hiển thị.
 */

// Danh sách các mã vai trò hợp lệ trong hệ thống IT Helpdesk
export const USER_ROLES = ["user", "technician", "admin"];

// Nhãn tiếng Việt tương ứng với từng vai trò để hiển thị trên Header, Profile và bảng quản trị
export const ROLE_LABELS = {
  user: "Người dùng",
  technician: "Nhân viên kỹ thuật",
  admin: "Quản trị viên",
};

// Đường dẫn đích mặc định sau khi đăng nhập hoặc truy cập gốc "/" theo từng vai trò
export const DEFAULT_ROLE_PATHS = {
  user: "/user/overview",
  technician: "/technician/overview",
  admin: "/admin/dashboard",
};

/**
 * Lấy nhãn hiển thị tiếng Việt của vai trò; fallback về "Tài khoản" nếu không xác định.
 */
export function getRoleLabel(role) {
  return ROLE_LABELS[role] ?? "Tài khoản";
}

/**
 * Trả về route mặc định tương ứng với vai trò người dùng; fallback về "/login".
 */
export function getDefaultPathForRole(role) {
  return DEFAULT_ROLE_PATHS[role] ?? "/login";
}
