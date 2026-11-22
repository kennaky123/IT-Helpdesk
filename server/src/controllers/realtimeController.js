/**
 * @file realtimeController.js
 * @description Controller thiết lập kết nối sự kiện thời gian thực (Server-Sent Events - SSE).
 * Vai trò Controller: Tiếp nhận HTTP request đăng ký lắng nghe luồng sự kiện realtime từ trình duyệt
 * và chuyển giao đối tượng request/response cho `realtimeService` quản lý vòng đời kết nối SSE.
 */
import { subscribeToRealtimeEvents } from "../services/realtimeService.js";

/**
 * Mở luồng kết nối SSE để đẩy thông báo thay đổi dữ liệu thời gian thực về cho client.
 *
 * @param {import("express").Request} request - HTTP request từ client mở kết nối SSE.
 * @param {import("express").Response} response - HTTP response được giữ mở dưới dạng `text/event-stream`.
 * @returns {void}
 */
export function getRealtimeEvents(request, response) {
  // Ủy quyền thiết lập header SSE, heartbeat và quản lý tập client đang kết nối cho realtimeService
  subscribeToRealtimeEvents(request, response);
}
