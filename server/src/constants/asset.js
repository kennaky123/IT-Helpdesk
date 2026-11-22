/**
 * @file asset.js
 * @description Tập hợp các hằng số chuẩn hóa (enum) cho phân hệ Quản lý Tài sản IT (Asset & Asset Request).
 * Vai trò trong kiến trúc Backend:
 * - Được dùng chung giữa tầng Model (schema enum), Validator và Controller để kiểm soát tính toàn vẹn dữ liệu.
 */

/** Danh sách các loại thiết bị phần cứng được quản lý trong hệ thống tài sản IT. */
export const ASSET_TYPES = Object.freeze([
  "laptop",
  "desktop",
  "monitor",
  "accessory",
  "other",
]);

/** Các trạng thái vòng đời của một tài sản IT (trong kho, đang sử dụng, bảo trì, thanh lý). */
export const ASSET_STATUSES = Object.freeze([
  "in_stock",
  "in_use",
  "maintenance",
  "retired",
]);

/** Các công cụ hỗ trợ điều khiển từ xa gắn với thiết bị đầu cuối. */
export const REMOTE_TOOLS = Object.freeze(["none", "anydesk", "teamviewer"]);

/** Các loại hành động được ghi nhận trong lịch sử biến động (`history`) của tài sản. */
export const ASSET_HISTORY_ACTIONS = Object.freeze([
  "created",
  "assigned",
  "returned",
  "status_changed",
  "updated",
]);

/** Các trạng thái xử lý của yêu cầu cấp phát / bàn giao tài sản (`AssetRequest`). */
export const ASSET_REQUEST_STATUSES = Object.freeze([
  "pending",
  "in_progress",
  "completed",
  "cancelled",
]);

