/**
 * @file ticket.js
 * @description Tập hợp hằng số và quy tắc chuyển đổi trạng thái cho phân hệ Quản lý Ticket IT Helpdesk.
 * Vai trò trong kiến trúc Backend:
 * - Định nghĩa mức độ ưu tiên, vòng đời trạng thái ticket và các trạng thái kết thúc/có thể hủy.
 * - Quy định ma trận chuyển trạng thái hợp lệ dành cho Technician để tầng service/controller kiểm tra nghiệp vụ.
 */

/** Mức độ ưu tiên xử lý của ticket từ thấp đến khẩn cấp. */
export const TICKET_PRIORITIES = Object.freeze([
  "low",
  "medium",
  "high",
  "urgent",
]);

/** Toàn bộ các trạng thái có thể có trong vòng đời của một ticket. */
export const TICKET_STATUSES = Object.freeze([
  "pending",
  "assigned",
  "in_progress",
  "waiting_user",
  "resolved",
  "closed",
  "cancelled",
]);

/** Các trạng thái cuối cùng (kết thúc quy trình xử lý chính của ticket). */
export const TERMINAL_TICKET_STATUSES = Object.freeze([
  "resolved",
  "closed",
  "cancelled",
]);

/** Các trạng thái mà người tạo ticket (user) vẫn được phép tự hủy yêu cầu. */
export const USER_CANCELLABLE_STATUSES = Object.freeze([
  "pending",
  "assigned",
]);

/**
 * Ma trận ánh xạ các bước chuyển trạng thái hợp lệ mà Technician được phép thực hiện:
 * - `assigned` -> `in_progress`
 * - `in_progress` -> `waiting_user` hoặc `resolved`
 * - `waiting_user` -> `in_progress`
 */
export const TECHNICIAN_STATUS_TRANSITIONS = Object.freeze({
  assigned: Object.freeze(["in_progress"]),
  in_progress: Object.freeze(["waiting_user", "resolved"]),
  waiting_user: Object.freeze(["in_progress"]),
});

/**
 * Kiểm tra xem Technician có được phép chuyển trạng thái ticket từ `fromStatus` sang `toStatus` hay không.
 * @param {string} fromStatus - Trạng thái hiện tại của ticket.
 * @param {string} toStatus - Trạng thái mục tiêu muốn chuyển tới.
 * @returns {boolean} `true` nếu bước chuyển hợp lệ theo `TECHNICIAN_STATUS_TRANSITIONS`, ngược lại `false`.
 */
export function canTechnicianTransition(fromStatus, toStatus) {
  return Boolean(
    TECHNICIAN_STATUS_TRANSITIONS[fromStatus]?.includes(toStatus),
  );
}
