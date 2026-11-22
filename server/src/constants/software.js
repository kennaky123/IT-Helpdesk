/**
 * @file software.js
 * @description Tập hợp các hằng số chuẩn hóa (enum) cho phân hệ Quản lý Bản quyền Phần mềm (Software License).
 * Vai trò trong kiến trúc Backend:
 * - Chuẩn hóa loại giấy phép, chu kỳ thanh toán, nhóm phần mềm và trạng thái hết hạn bản quyền
 *   trên toàn bộ tầng Model, Service và Validator.
 */

/** Các hình thức cấp phép bản quyền phần mềm (thuê bao SaaS, vĩnh viễn, số lượng lớn, OEM theo máy). */
export const LICENSE_TYPES = Object.freeze([
  "saas_subscription",
  "perpetual",
  "volume",
  "oem",
]);

/** Chu kỳ gia hạn / thanh toán chi phí bản quyền phần mềm. */
export const BILLING_CYCLES = Object.freeze([
  "monthly",
  "yearly",
  "one_time",
]);

/** Danh mục phân loại phần mềm hiển thị và lọc trong hệ thống quản trị bản quyền. */
export const SOFTWARE_CATEGORIES = Object.freeze([
  "Văn phòng & Email",
  "Thiết kế & Đồ họa",
  "Lập trình & Phát triển",
  "Bảo mật & Tiện ích",
  "Giao tiếp & Cộng tác",
  "Hệ điều hành & Máy chủ",
  "Khác",
]);

/** Các trạng thái hiệu lực của gói bản quyền (còn hạn, sắp hết hạn, đã hết hạn). */
export const LICENSE_STATUSES = Object.freeze([
  "active",
  "expiring_soon",
  "expired",
]);

