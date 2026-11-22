/**
 * @file ticketRoutes.js
 * @description Định nghĩa Express Router trung tâm cho toàn bộ vòng đời xử lý phiếu hỗ trợ IT (Tickets).
 * Vai trò trong kiến trúc Backend: Thuộc tầng Router (Express Router), gắn dưới tiền tố `/api/tickets`.
 * Áp dụng xác thực JWT toàn cục (`router.use(authenticate)`), phân quyền theo từng hành động nghiệp vụ,
 * xử lý upload/cleanup tệp đính kèm, validate tham số/body và tích hợp sub-router hội thoại `ticketConversationRoutes`.
 */
import { Router } from "express";
import {
  assignTechnician,
  cancelTicket,
  closeTicket,
  createTicket,
  getTicketAttachment,
  getTicketById,
  listTickets,
  updateTicketResolution,
  updateTicketStatus,
} from "../controllers/ticketController.js";
import { authenticate } from "../middleware/authenticate.js";
import { authorizeRoles } from "../middleware/authorizeRoles.js";
import {
  cleanupTicketAttachmentUpload,
  uploadTicketAttachments,
  validateTicketAttachmentContent,
} from "../middleware/ticketAttachmentUpload.js";
import ticketConversationRoutes from "./ticketConversationRoutes.js";
import {
  validateAssignment,
  validateAttachmentId,
  validateCancellation,
  validateCloseTicket,
  validateCreateTicket,
  validateResolution,
  validateStatusUpdate,
  validateTicketId,
  validateTicketQuery,
} from "../validators/ticketValidators.js";

const router = Router();

// Middleware cấp router: Bắt buộc xác thực JWT cho tất cả endpoint thuộc /api/tickets
router.use(authenticate);

// Nhóm route gốc "/" cho danh sách và tạo mới Ticket
router
  .route("/")
  // GET / - Lấy danh sách ticket theo bộ lọc, phân trang (controller tự giới hạn phạm vi dữ liệu theo role)
  .get(
    authorizeRoles("user", "technician", "admin"),
    validateTicketQuery,
    listTickets,
  )
  // POST / - Tạo ticket mới kèm tối đa 5 ảnh đính kèm
  // Luồng xử lý: Phân quyền -> nhận upload ảnh -> kiểm tra magic bytes/nội dung file -> validate field ticket -> tạo ticket -> dọn file tạm nếu lỗi
  .post(
    authorizeRoles("user", "technician", "admin"),
    uploadTicketAttachments,
    validateTicketAttachmentContent,
    validateCreateTicket,
    createTicket,
    cleanupTicketAttachmentUpload,
  );

// PATCH /:ticketId/assign - Phân công hoặc chuyển giao kỹ thuật viên phụ trách ticket
// Phân quyền: Chỉ admin hoặc technician -> validate ticketId & body phân công -> assignTechnician
router.patch(
  "/:ticketId/assign",
  authorizeRoles("admin", "technician"),
  validateTicketId,
  validateAssignment,
  assignTechnician,
);

// PATCH /:ticketId/status - Cập nhật trạng thái xử lý ticket (in_progress, waiting_user, resolved)
// Phân quyền: technician hoặc admin -> validate ticketId & payload trạng thái/ghi chú -> updateTicketStatus
router.patch(
  "/:ticketId/status",
  authorizeRoles("technician", "admin"),
  validateTicketId,
  validateStatusUpdate,
  updateTicketStatus,
);

// PATCH /:ticketId/resolution - Cập nhật nội dung giải pháp xử lý của kỹ thuật viên
// Phân quyền: Chỉ technician -> validate ticketId & nội dung resolution -> updateTicketResolution
router.patch(
  "/:ticketId/resolution",
  authorizeRoles("technician"),
  validateTicketId,
  validateResolution,
  updateTicketResolution,
);

// PATCH /:ticketId/cancel - Hủy ticket (kèm lý do tùy chọn)
// Phân quyền: user (chủ ticket) hoặc admin -> validate ticketId & lý do hủy -> cancelTicket
router.patch(
  "/:ticketId/cancel",
  authorizeRoles("user", "admin"),
  validateTicketId,
  validateCancellation,
  cancelTicket,
);

// PATCH /:ticketId/close - Đóng hoàn tất ticket sau khi đã xử lý
// Phân quyền: user, admin hoặc technician -> validate ticketId & ghi chú đóng -> closeTicket
router.patch(
  "/:ticketId/close",
  authorizeRoles("user", "admin", "technician"),
  validateTicketId,
  validateCloseTicket,
  closeTicket,
);

// GET /:ticketId/attachments/:attachmentId - Tải hoặc xem tệp ảnh đính kèm của ticket
// Phân quyền: user, technician, admin (controller xác minh quyền truy cập ticket) -> validate cả 2 ObjectId
router.get(
  "/:ticketId/attachments/:attachmentId",
  authorizeRoles("user", "technician", "admin"),
  validateTicketId,
  validateAttachmentId,
  getTicketAttachment,
);

// Gắn sub-router hội thoại (/comments, /internal-notes, /history) dưới tiền tố /:ticketId
router.use("/:ticketId", ticketConversationRoutes);

// GET /:ticketId - Xem thông tin chi tiết của một ticket (đặt cuối cùng để không chặn các route con phía trên)
router.get(
  "/:ticketId",
  authorizeRoles("user", "technician", "admin"),
  validateTicketId,
  getTicketById,
);

export default router;
