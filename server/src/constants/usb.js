/**
 * @file usb.js
 * @description Tập hợp các hằng số chuẩn hóa cho phân hệ Giám sát & Kiểm soát thiết bị USB (USB Security / DLP).
 * Vai trò trong kiến trúc Backend:
 * - Đồng bộ danh mục trạng thái tin cậy, loại sự kiện kết nối và phân loại thiết bị USB giữa Agent và API.
 */

/** Trạng thái phân quyền bảo mật của thiết bị USB (tin cậy, chưa xác minh, đã chặn). */
export const USB_DEVICE_STATUSES = Object.freeze([
  "trusted",
  "unverified",
  "blocked",
]);

/** Loại sự kiện cắm/rút thiết bị USB do Windows Agent ghi nhận và gửi về server. */
export const USB_EVENT_TYPES = Object.freeze([
  "connected",
  "disconnected",
]);

/** Phân loại phần cứng của thiết bị USB (ổ lưu trữ, thiết bị nhập HID, điện thoại MTP, âm thanh/hình ảnh, khác). */
export const USB_DEVICE_TYPES = Object.freeze([
  "storage",
  "input_hid",
  "mobile_mtp",
  "audio_video",
  "other_usb",
]);

