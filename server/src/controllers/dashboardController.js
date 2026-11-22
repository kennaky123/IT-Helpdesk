/**
 * @file dashboardController.js
 * @description Controller cung cấp số liệu tổng quan Dashboard theo từng vai trò (Admin, User, Technician).
 * Vai trò Controller: Tiếp nhận HTTP request từ các endpoint dashboard, ủy quyền tính toán
 * thống kê cho `dashboardService`, gắn header chống cache dữ liệu nhạy cảm (`no-store`) và trả response JSON.
 */
import {
  getAdminDashboard,
  getTechnicianDashboard,
  getUserDashboard,
} from "../services/dashboardService.js";

/**
 * Lấy dữ liệu dashboard tổng hợp toàn hệ thống dành cho Quản trị viên (Admin).
 *
 * @param {import("express").Request} request - HTTP request từ Admin đã xác thực.
 * @param {import("express").Response} response - HTTP response trả về số liệu dashboard tổng quan.
 * @param {import("express").NextFunction} next - Middleware chuyển tiếp lỗi.
 * @returns {Promise<import("express").Response|void>} JSON response HTTP 200.
 */
export async function getDashboard(request, response, next) {
  try {
    const dashboard = await getAdminDashboard();

    // Không cho phép trình duyệt hoặc proxy cache dữ liệu thống kê nội bộ
    response.set("Cache-Control", "private, no-store");
    response.vary("Authorization");

    return response.status(200).json({
      success: true,
      message: "Lấy dữ liệu dashboard thành công.",
      data: dashboard,
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Lấy dữ liệu dashboard cá nhân của người dùng đang đăng nhập (ticket đã gửi và tiến độ).
 *
 * @param {import("express").Request} request - HTTP request chứa `request.user._id`.
 * @param {import("express").Response} response - HTTP response trả về tổng quan ticket của user.
 * @param {import("express").NextFunction} next - Middleware chuyển tiếp lỗi.
 * @returns {Promise<import("express").Response|void>} JSON response HTTP 200.
 */
export async function getUserDashboardData(request, response, next) {
  try {
    const dashboard = await getUserDashboard(request.user._id);
    // Đánh dấu response là dữ liệu riêng tư theo Authorization header
    response.set("Cache-Control", "private, no-store");
    response.vary("Authorization");
    return response.status(200).json({
      success: true,
      message: "Lấy dữ liệu tổng quan người dùng thành công.",
      data: dashboard,
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Lấy dữ liệu dashboard hiệu suất và danh sách ticket ưu tiên cho Kỹ thuật viên đang đăng nhập.
 *
 * @param {import("express").Request} request - HTTP request chứa `request.user._id` của kỹ thuật viên.
 * @param {import("express").Response} response - HTTP response trả về KPI và danh sách việc cần xử lý.
 * @param {import("express").NextFunction} next - Middleware chuyển tiếp lỗi.
 * @returns {Promise<import("express").Response|void>} JSON response HTTP 200.
 */
export async function getTechnicianDashboardData(request, response, next) {
  try {
    const dashboard = await getTechnicianDashboard(request.user._id);

    // Chặn cache để kỹ thuật viên luôn thấy trạng thái ticket và tỷ lệ hoàn thành mới nhất
    response.set("Cache-Control", "private, no-store");
    response.vary("Authorization");

    return response.status(200).json({
      success: true,
      message: "Lấy dữ liệu dashboard kỹ thuật viên thành công.",
      data: dashboard,
    });
  } catch (error) {
    return next(error);
  }
}
