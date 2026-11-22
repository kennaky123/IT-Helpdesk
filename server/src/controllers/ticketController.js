/**
 * @file ticketController.js
 * @description Controller điều phối các thao tác liên quan đến vòng đời Ticket hỗ trợ CNTT.
 * Vai trò Controller: Tiếp nhận HTTP request từ các route ticket (tạo mới kèm tệp đính kèm,
 * lọc danh sách, xem chi tiết, tải tệp đính kèm, phân công kỹ thuật viên, cập nhật trạng thái/giải pháp,
 * hủy và đóng ticket), gọi `ticketService` xử lý nghiệp vụ và trả về JSON hoặc file response.
 */
import {
  assignTechnician as assignTechnicianService,
  cancelTicket as cancelTicketService,
  closeTicket as closeTicketService,
  createTicket as createTicketService,
  getTicketAttachment as getTicketAttachmentService,
  getTicketById as getTicketByIdService,
  listTickets as listTicketsService,
  updateTicketResolution as updateTicketResolutionService,
  updateTicketStatus as updateTicketStatusService,
} from "../services/ticketService.js";

/**
 * Mã hóa tên tệp đính kèm theo chuẩn RFC 5987 để gắn an toàn vào header `Content-Disposition`.
 *
 * @param {string} fileName - Tên tệp gốc cần mã hóa.
 * @returns {string} Chuỗi tên tệp đã được percent-encode đầy đủ ký tự đặc biệt.
 */
function encodeFileName(fileName) {
  return encodeURIComponent(fileName).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/**
 * Tạo ticket hỗ trợ mới (có thể kèm tệp đính kèm tải lên qua Multer).
 *
 * @param {import("express").Request} request - HTTP request chứa dữ liệu ticket trong `body`, `user` và `files`.
 * @param {import("express").Response} response - HTTP response trả về ticket vừa tạo.
 * @param {import("express").NextFunction} next - Middleware chuyển tiếp lỗi.
 * @returns {Promise<import("express").Response|void>} JSON response HTTP 201.
 */
export async function createTicket(request, response, next) {
  try {
    const ticket = await createTicketService(
      request.body,
      request.user,
      request.files,
    );

    return response.status(201).json({
      success: true,
      message: "Tạo ticket thành công.",
      data: { ticket },
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Lấy danh sách ticket có phân trang, tìm kiếm và lọc theo quyền hạn người dùng.
 *
 * @param {import("express").Request} request - HTTP request chứa `ticketQuery` đã chuẩn hóa và `user`.
 * @param {import("express").Response} response - HTTP response trả về danh sách ticket và thông tin phân trang.
 * @param {import("express").NextFunction} next - Middleware chuyển tiếp lỗi.
 * @returns {Promise<import("express").Response|void>} JSON response HTTP 200.
 */
export async function listTickets(request, response, next) {
  try {
    const result = await listTicketsService(
      request.ticketQuery,
      request.user,
    );

    return response.status(200).json({
      success: true,
      message: "Lấy danh sách ticket thành công.",
      data: result,
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Lấy thông tin chi tiết của một ticket theo ID.
 *
 * @param {import("express").Request} request - HTTP request chứa `params.ticketId` và `user`.
 * @param {import("express").Response} response - HTTP response trả về chi tiết ticket.
 * @param {import("express").NextFunction} next - Middleware chuyển tiếp lỗi.
 * @returns {Promise<import("express").Response|void>} JSON response HTTP 200.
 */
export async function getTicketById(request, response, next) {
  try {
    const ticket = await getTicketByIdService(
      request.params.ticketId,
      request.user,
    );

    return response.status(200).json({
      success: true,
      message: "Lấy chi tiết ticket thành công.",
      data: { ticket },
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Truy xuất và gửi trực tiếp tệp đính kèm của ticket cho người dùng có quyền xem.
 *
 * @param {import("express").Request} request - HTTP request chứa `params.ticketId`, `params.attachmentId` và `user`.
 * @param {import("express").Response} response - HTTP response gửi tệp kèm các header bảo mật nội dung.
 * @param {import("express").NextFunction} next - Middleware chuyển tiếp lỗi.
 * @returns {Promise<void>} Gửi tệp qua `sendFile` hoặc chuyển lỗi cho middleware.
 */
export async function getTicketAttachment(request, response, next) {
  try {
    const attachment = await getTicketAttachmentService(
      request.params.ticketId,
      request.params.attachmentId,
      request.user,
    );

    // Thiết lập header chống MIME sniffing và hiển thị tên tệp UTF-8 an toàn
    response.set({
      "Cache-Control": "private, max-age=300",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeFileName(attachment.originalName)}`,
      "Content-Type": attachment.mimeType,
      "X-Content-Type-Options": "nosniff",
    });

    return response.sendFile(attachment.filePath, (error) => {
      if (error) {
        next(error);
      }
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Phân công hoặc chuyển giao kỹ thuật viên xử lý ticket.
 *
 * @param {import("express").Request} request - HTTP request chứa `params.ticketId`, `{ technicianId, reason }` và `user`.
 * @param {import("express").Response} response - HTTP response trả về ticket sau khi phân công.
 * @param {import("express").NextFunction} next - Middleware chuyển tiếp lỗi.
 * @returns {Promise<import("express").Response|void>} JSON response HTTP 200.
 */
export async function assignTechnician(request, response, next) {
  try {
    const ticket = await assignTechnicianService(
      request.params.ticketId,
      request.body,
      request.user,
    );

    return response.status(200).json({
      success: true,
      message: "Phân công Technician thành công.",
      data: { ticket },
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Cập nhật trạng thái xử lý của ticket theo luồng chuyển trạng thái hợp lệ.
 *
 * @param {import("express").Request} request - HTTP request chứa `params.ticketId`, payload trạng thái mới và `user`.
 * @param {import("express").Response} response - HTTP response trả về ticket sau khi đổi trạng thái.
 * @param {import("express").NextFunction} next - Middleware chuyển tiếp lỗi.
 * @returns {Promise<import("express").Response|void>} JSON response HTTP 200.
 */
export async function updateTicketStatus(request, response, next) {
  try {
    const ticket = await updateTicketStatusService(
      request.params.ticketId,
      request.body,
      request.user,
    );

    return response.status(200).json({
      success: true,
      message: "Cập nhật trạng thái ticket thành công.",
      data: { ticket },
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Cập nhật nội dung cách giải quyết (`resolution`) cho ticket đang xử lý.
 *
 * @param {import("express").Request} request - HTTP request chứa `params.ticketId`, `body.resolution` và `user`.
 * @param {import("express").Response} response - HTTP response trả về ticket đã cập nhật giải pháp.
 * @param {import("express").NextFunction} next - Middleware chuyển tiếp lỗi.
 * @returns {Promise<import("express").Response|void>} JSON response HTTP 200.
 */
export async function updateTicketResolution(request, response, next) {
  try {
    const ticket = await updateTicketResolutionService(
      request.params.ticketId,
      request.body.resolution,
      request.user,
    );

    return response.status(200).json({
      success: true,
      message: "Cập nhật nội dung giải quyết thành công.",
      data: { ticket },
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Hủy ticket khi còn ở trạng thái được phép hủy kèm lý do.
 *
 * @param {import("express").Request} request - HTTP request chứa `params.ticketId`, `body.reason` và `user`.
 * @param {import("express").Response} response - HTTP response trả về ticket đã hủy.
 * @param {import("express").NextFunction} next - Middleware chuyển tiếp lỗi.
 * @returns {Promise<import("express").Response|void>} JSON response HTTP 200.
 */
export async function cancelTicket(request, response, next) {
  try {
    const ticket = await cancelTicketService(
      request.params.ticketId,
      request.body.reason,
      request.user,
    );

    return response.status(200).json({
      success: true,
      message: "Hủy ticket thành công.",
      data: { ticket },
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Đóng ticket đã được giải quyết (`resolved` -> `closed`).
 *
 * @param {import("express").Request} request - HTTP request chứa `params.ticketId`, `body.note` và `user`.
 * @param {import("express").Response} response - HTTP response trả về ticket đã đóng.
 * @param {import("express").NextFunction} next - Middleware chuyển tiếp lỗi.
 * @returns {Promise<import("express").Response|void>} JSON response HTTP 200.
 */
export async function closeTicket(request, response, next) {
  try {
    const ticket = await closeTicketService(
      request.params.ticketId,
      request.body.note,
      request.user,
    );

    return response.status(200).json({
      success: true,
      message: "Đóng ticket thành công.",
      data: { ticket },
    });
  } catch (error) {
    return next(error);
  }
}
