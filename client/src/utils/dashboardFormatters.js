/**
 * @file dashboardFormatters.js
 * @description Tập hợp các hàm định dạng số liệu, mốc thời gian theo múi giờ và chữ cái viết tắt cho Dashboard.
 * Vai trò trong kiến trúc Frontend: Thuộc tầng Utility helpers, tối ưu hiệu năng hiển thị bảng và thẻ KPI
 * thông qua cơ chế cache các instance `Intl.DateTimeFormat` theo từng `timeZone`.
 */

const numberFormatter = new Intl.NumberFormat("vi-VN");
// Cache bộ định dạng theo từng timeZone để tránh khởi tạo lại Intl.DateTimeFormat khi render nhiều dòng
const dateTimeFormatters = new Map();
const generatedTimeFormatters = new Map();

/**
 * Lấy hoặc khởi tạo bộ định dạng ngày giờ ngắn gọn được cache theo `timeZone`.
 *
 * @param {string} timeZone - Tên múi giờ IANA (vd: "Asia/Ho_Chi_Minh").
 * @returns {Intl.DateTimeFormat}
 */
function getDateTimeFormatter(timeZone) {
  if (!dateTimeFormatters.has(timeZone)) {
    dateTimeFormatters.set(
      timeZone,
      new Intl.DateTimeFormat("vi-VN", {
        dateStyle: "short",
        timeStyle: "short",
        timeZone,
      }),
    );
  }

  return dateTimeFormatters.get(timeZone);
}

/**
 * Lấy hoặc khởi tạo bộ định dạng thời điểm tổng hợp báo cáo (`dd/mm/yyyy, hh:mm`) theo `timeZone`.
 *
 * @param {string} timeZone - Tên múi giờ IANA.
 * @returns {Intl.DateTimeFormat}
 */
function getGeneratedTimeFormatter(timeZone) {
  if (!generatedTimeFormatters.has(timeZone)) {
    generatedTimeFormatters.set(
      timeZone,
      new Intl.DateTimeFormat("vi-VN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone,
      }),
    );
  }

  return generatedTimeFormatters.get(timeZone);
}

/**
 * Định dạng số thống kê trên Dashboard theo quy chuẩn phân cách hàng nghìn tiếng Việt.
 *
 * @param {unknown} value - Giá trị số cần định dạng.
 * @returns {string} Chuỗi số đã định dạng hoặc `"—"` nếu không phải số hữu hạn.
 */
export function formatDashboardNumber(value) {
  return Number.isFinite(value) ? numberFormatter.format(value) : "—";
}

/**
 * Định dạng mốc thời gian ngắn gọn (ngày/tháng/năm và giờ:phút) của ticket trên Dashboard.
 *
 * @param {string | number | Date} value - Thời gian cần hiển thị.
 * @param {string} timeZone - Múi giờ nhận từ phản hồi Dashboard của máy chủ.
 * @returns {string} Chuỗi thời gian đã định dạng hoặc `"—"` nếu dữ liệu/múi giờ lỗi.
 */
export function formatDashboardDateTime(value, timeZone) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  // Bắt lỗi RangeError phòng trường hợp chuỗi timeZone từ server không hợp lệ với Intl
  try {
    return getDateTimeFormatter(timeZone).format(date);
  } catch {
    return "—";
  }
}

/**
 * Định dạng thời điểm cập nhật gần nhất (`generatedAt`) hiển thị ở phần đầu Dashboard.
 *
 * @param {string | number | Date} value - Thời điểm dữ liệu được tổng hợp.
 * @param {string} timeZone - Múi giờ chuẩn từ máy chủ.
 * @returns {string} Chuỗi thời gian hoặc `"—"` nếu không hợp lệ.
 */
export function formatDashboardGeneratedAt(value, timeZone) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  try {
    return getGeneratedTimeFormatter(timeZone).format(date);
  } catch {
    return "—";
  }
}

/**
 * Lấy tối đa 2 chữ cái viết tắt (viết hoa) từ hai từ cuối trong họ tên người dùng.
 *
 * @param {string} [fullName=""] - Họ tên đầy đủ.
 * @returns {string} Chữ cái viết tắt đại diện cho tên.
 */
export function getNameInitials(fullName = "") {
  return fullName
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(-2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");
}
