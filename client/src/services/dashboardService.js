/**
 * @file dashboardService.js
 * @description Service truy vấn và kiểm chứng schema dữ liệu bảng điều khiển (Dashboard) cho 3 vai trò: Admin, Technician và User.
 * Vai trò trong kiến trúc Frontend: Thuộc tầng API Services, bảo vệ các component biểu đồ và thẻ thống kê
 * khỏi dữ liệu sai định dạng bằng bộ validator runtime trước khi đưa vào React Query cache.
 */
import axiosClient from "../api/axiosClient.js";

// Danh sách 4 chỉ số tổng quan bắt buộc trên màn hình Admin Dashboard
const SUMMARY_FIELDS = [
  "totalTickets",
  "pendingTickets",
  "processingTickets",
  "completedTickets",
];

/**
 * Kiểm tra giá trị có phải là số hữu hạn không âm (>= 0) hay không.
 *
 * @param {unknown} value - Giá trị cần kiểm tra.
 * @returns {boolean}
 */
function isNonNegativeNumber(value) {
  return Number.isFinite(value) && value >= 0;
}

/**
 * Kiểm tra tính hợp lệ của một phần tử dữ liệu biểu đồ theo danh sách trường chuỗi và trường số bắt buộc.
 *
 * @param {any} item - Phần tử dữ liệu biểu đồ.
 * @param {Array<string>} requiredStringFields - Tên các trường chuỗi không được rỗng.
 * @param {Array<string>} numberFields - Tên các trường số không âm.
 * @returns {boolean}
 */
function isValidSeriesItem(item, requiredStringFields, numberFields) {
  return Boolean(
    item &&
      requiredStringFields.every(
        (field) => typeof item[field] === "string" && item[field].length > 0,
      ) &&
      numberFields.every((field) => isNonNegativeNumber(item[field])),
  );
}

/**
 * Kiểm chứng toàn bộ cấu trúc dữ liệu trả về của Admin Dashboard.
 *
 * @param {any} dashboard - Payload nhận từ endpoint `/dashboard`.
 * @returns {boolean} `true` nếu đầy đủ thống kê summary, 5 mảng biểu đồ và danh sách ticket mới nhất.
 */
function isValidDashboard(dashboard) {
  // Kiểm tra metadata thời gian sinh dữ liệu, múi giờ và các khối chính
  if (
    !dashboard ||
    typeof dashboard.generatedAt !== "string" ||
    Number.isNaN(new Date(dashboard.generatedAt).getTime()) ||
    typeof dashboard.timeZone !== "string" ||
    !dashboard.summary ||
    !dashboard.charts ||
    !Array.isArray(dashboard.latestTickets)
  ) {
    return false;
  }

  // Đảm bảo tất cả các chỉ số tổng hợp đều là số không âm hợp lệ
  if (
    !SUMMARY_FIELDS.every((field) =>
      isNonNegativeNumber(dashboard.summary[field]),
    )
  ) {
    return false;
  }

  const {
    ticketsByCategory,
    ticketsByStatus,
    ticketsCreatedLast7Days,
    ticketsResolvedLast7Days,
    technicianPerformance,
  } = dashboard.charts;

  // Kiểm chứng cấu trúc từng chuỗi dữ liệu biểu đồ (theo danh mục, trạng thái, 7 ngày và hiệu suất KTV)
  return Boolean(
    Array.isArray(ticketsByCategory) &&
      ticketsByCategory.every((item) =>
        isValidSeriesItem(item, ["key", "name"], ["value"]),
      ) &&
      Array.isArray(ticketsByStatus) &&
      ticketsByStatus.every((item) =>
        isValidSeriesItem(item, ["key", "name"], ["value"]),
      ) &&
      Array.isArray(ticketsCreatedLast7Days) &&
      ticketsCreatedLast7Days.every((item) =>
        isValidSeriesItem(item, ["date", "name"], ["value"]),
      ) &&
      Array.isArray(ticketsResolvedLast7Days) &&
      ticketsResolvedLast7Days.every((item) =>
        isValidSeriesItem(item, ["date", "name"], ["value"]),
      ) &&
      Array.isArray(technicianPerformance) &&
      technicianPerformance.every((item) =>
        isValidSeriesItem(
          item,
          ["technicianId", "name"],
          ["inProgress", "completed"],
        ),
      )
  );
}

/**
 * Kiểm chứng cấu trúc dữ liệu trả về của Dashboard Kỹ thuật viên.
 *
 * @param {any} dashboard - Payload nhận từ endpoint `/dashboard/technician`.
 * @returns {boolean} `true` nếu 9 chỉ số KPI và danh sách `workTickets` hợp lệ.
 */
function isValidTechnicianDashboard(dashboard) {
  const summary = dashboard?.summary;
  const summaryFields = [
    "assignedTickets",
    "assignedToday",
    "inProgressTickets",
    "waitingUserTickets",
    "urgentTickets",
    "completedThisWeek",
    "assignedThisMonth",
    "completedThisMonth",
    "completionRate",
  ];

  return Boolean(
    dashboard &&
      typeof dashboard.generatedAt === "string" &&
      !Number.isNaN(new Date(dashboard.generatedAt).getTime()) &&
      typeof dashboard.timeZone === "string" &&
      summary &&
      summaryFields.every((field) => isNonNegativeNumber(summary[field])) &&
      Array.isArray(dashboard.workTickets) &&
      dashboard.workTickets.every(
        (ticket) =>
          ticket &&
          typeof ticket.id === "string" &&
          typeof ticket.ticketCode === "string" &&
          typeof ticket.title === "string" &&
          typeof ticket.priority === "string" &&
          typeof ticket.status === "string" &&
          typeof ticket.createdAt === "string",
      ),
  );
}

/**
 * Kiểm chứng cấu trúc dữ liệu trả về của Dashboard Người dùng cuối.
 *
 * @param {any} dashboard - Payload nhận từ endpoint `/dashboard/user`.
 * @returns {boolean} `true` nếu 4 chỉ số summary và mảng `recentTickets` hợp lệ.
 */
function isValidUserDashboard(dashboard) {
  const summary = dashboard?.summary;
  return Boolean(
    dashboard &&
      typeof dashboard.generatedAt === "string" &&
      summary &&
      ["totalTickets", "processingTickets", "waitingUserTickets", "completedTickets"].every(
        (field) => isNonNegativeNumber(summary[field]),
      ) &&
      Array.isArray(dashboard.recentTickets),
  );
}

/**
 * Tạo đối tượng lỗi chuẩn khi payload Dashboard sai định dạng kỳ vọng.
 *
 * @returns {Error & { code: string }} Lỗi gắn mã `"INVALID_DASHBOARD_RESPONSE"`.
 */
function createInvalidResponseError() {
  const error = new Error("Phản hồi dashboard không hợp lệ.");
  error.code = "INVALID_DASHBOARD_RESPONSE";
  return error;
}

/**
 * Lấy dữ liệu tổng hợp Dashboard dành cho Quản trị viên (Admin).
 *
 * @param {{ signal?: AbortSignal }} [options] - Tùy chọn hủy request từ React Query.
 * @returns {Promise<object>} Dữ liệu Admin Dashboard đã vượt qua kiểm tra schema.
 */
export async function getAdminDashboard({ signal } = {}) {
  const response = await axiosClient.get("/dashboard", { signal });
  const dashboard = response.data?.data;

  if (!isValidDashboard(dashboard)) {
    throw createInvalidResponseError();
  }

  return dashboard;
}

/**
 * Lấy dữ liệu Dashboard công việc dành cho Kỹ thuật viên (Technician).
 *
 * @param {{ signal?: AbortSignal }} [options] - Tùy chọn hủy request.
 * @returns {Promise<object>} Dữ liệu Technician Dashboard hợp lệ.
 */
export async function getTechnicianDashboard({ signal } = {}) {
  const response = await axiosClient.get("/dashboard/technician", { signal });
  const dashboard = response.data?.data;

  if (!isValidTechnicianDashboard(dashboard)) {
    throw createInvalidResponseError();
  }

  return dashboard;
}

/**
 * Lấy dữ liệu Dashboard cá nhân dành cho Người dùng cuối (User).
 *
 * @param {{ signal?: AbortSignal }} [options] - Tùy chọn hủy request.
 * @returns {Promise<object>} Dữ liệu User Dashboard hợp lệ.
 */
export async function getUserDashboard({ signal } = {}) {
  const response = await axiosClient.get("/dashboard/user", { signal });
  const dashboard = response.data?.data;
  if (!isValidUserDashboard(dashboard)) throw createInvalidResponseError();
  return dashboard;
}

/**
 * Chuyển đổi lỗi tải Dashboard sang thông báo tiếng Việt rõ ràng.
 *
 * @param {any} error - Đối tượng lỗi từ axios hoặc validator nội bộ.
 * @returns {string} Chuỗi thông báo lỗi hiển thị trên giao diện Dashboard.
 */
export function getDashboardErrorMessage(error) {
  if (error?.code === "ECONNABORTED") {
    return "Máy chủ phản hồi quá lâu. Vui lòng thử lại.";
  }

  if (error?.code === "INVALID_DASHBOARD_RESPONSE") {
    return "Dữ liệu dashboard nhận được không đúng định dạng.";
  }

  if (!error?.response) {
    return "Không thể kết nối đến máy chủ. Vui lòng kiểm tra kết nối và thử lại.";
  }

  if (error.response.status === 403) {
    return "Tài khoản của bạn không có quyền xem dashboard này.";
  }

  if (error.response.status >= 500) {
    return "Máy chủ đang gặp sự cố khi tổng hợp dữ liệu dashboard.";
  }

  const apiMessage = error.response.data?.message;
  return typeof apiMessage === "string" && apiMessage.length > 0
    ? apiMessage
    : "Không thể tải dữ liệu dashboard. Vui lòng thử lại.";
}
