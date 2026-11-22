/**
 * @file ticketConversationController.js
 * @description Controller quản lý hội thoại bình luận, ghi chú nội bộ và lịch sử xử lý ticket.
 * Vai trò Controller: Tiếp nhận HTTP request tạo comment công khai, tạo ghi chú nội bộ,
 * lấy danh sách comment phân trang và xem dòng thời gian lịch sử ticket; ủy quyền xử lý
 * phân quyền và truy vấn cho `ticketConversationService` rồi trả về JSON response.
 */
import {
  createTicketComment as createTicketCommentService,
  getTicketHistory as getTicketHistoryService,
  listTicketComments as listTicketCommentsService,
} from "../services/ticketConversationService.js";

/**
 * Tạo bình luận công khai (`isInternal = false`) trên một ticket giữa người tạo và kỹ thuật viên.
 *
 * @param {import("express").Request} request - HTTP request chứa `params.ticketId`, `body.content` và `user`.
 * @param {import("express").Response} response - HTTP response trả về bình luận vừa tạo.
 * @param {import("express").NextFunction} next - Middleware chuyển tiếp lỗi.
 * @returns {Promise<import("express").Response|void>} JSON response HTTP 201.
 */
export async function createTicketComment(request, response, next) {
  try {
    // Truyền cờ isInternal = false để tạo bình luận hiển thị cho cả người dùng và kỹ thuật viên
    const comment = await createTicketCommentService(
      request.params.ticketId,
      request.body,
      request.user,
      false,
    );

    return response.status(201).json({
      success: true,
      message: "Gửi comment thành công.",
      data: { comment },
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Tạo ghi chú nội bộ (`isInternal = true`) chỉ dành cho kỹ thuật viên được phân công và quản trị viên.
 *
 * @param {import("express").Request} request - HTTP request chứa `params.ticketId`, `body.content` và `user`.
 * @param {import("express").Response} response - HTTP response trả về ghi chú nội bộ vừa tạo.
 * @param {import("express").NextFunction} next - Middleware chuyển tiếp lỗi.
 * @returns {Promise<import("express").Response|void>} JSON response HTTP 201.
 */
export async function createInternalNote(request, response, next) {
  try {
    // Truyền cờ isInternal = true để ẩn ghi chú này khỏi người dùng cuối
    const comment = await createTicketCommentService(
      request.params.ticketId,
      request.body,
      request.user,
      true,
    );

    return response.status(201).json({
      success: true,
      message: "Tạo ghi chú nội bộ thành công.",
      data: { comment },
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Lấy danh sách bình luận (và ghi chú nội bộ nếu đủ quyền) của ticket có phân trang.
 *
 * @param {import("express").Request} request - HTTP request chứa `params.ticketId`, `ticket`, `commentQuery` và `user`.
 * @param {import("express").Response} response - HTTP response trả về danh sách comment và phân trang.
 * @param {import("express").NextFunction} next - Middleware chuyển tiếp lỗi.
 * @returns {Promise<import("express").Response|void>} JSON response HTTP 200.
 */
export async function listTicketComments(request, response, next) {
  try {
    const result = await listTicketCommentsService(
      request.params.ticketId,
      request.user,
      request.ticket,
      request.commentQuery,
    );

    return response.status(200).json({
      success: true,
      message: "Lấy danh sách comment thành công.",
      data: result,
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Lấy dòng thời gian lịch sử thay đổi trạng thái và lịch sử phân công của ticket.
 *
 * @param {import("express").Request} request - HTTP request chứa `params.ticketId`, `ticket` và `user`.
 * @param {import("express").Response} response - HTTP response trả về mã ticket và mảng lịch sử đã sắp xếp.
 * @param {import("express").NextFunction} next - Middleware chuyển tiếp lỗi.
 * @returns {Promise<import("express").Response|void>} JSON response HTTP 200.
 */
export async function getTicketHistory(request, response, next) {
  try {
    const result = await getTicketHistoryService(
      request.params.ticketId,
      request.user,
      request.ticket,
    );

    return response.status(200).json({
      success: true,
      message: "Lấy lịch sử xử lý ticket thành công.",
      data: result,
    });
  } catch (error) {
    return next(error);
  }
}
