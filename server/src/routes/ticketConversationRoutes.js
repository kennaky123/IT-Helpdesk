/**
 * @file ticketConversationRoutes.js
 * @description Định nghĩa Express Sub-Router quản lý luồng trao đổi, ghi chú nội bộ và lịch sử trên một Ticket.
 * Vai trò trong kiến trúc Backend: Thuộc tầng Router (Express Router), được gắn lồng dưới `/api/tickets/:ticketId`.
 * Sử dụng `{ mergeParams: true }` để kế thừa tham số `:ticketId` từ `ticketRoutes.js`, đồng thời kết hợp
 * middleware kiểm tra quyền tham gia ticket (`requireTicketParticipantOrAdmin`) trước khi xử lý.
 */
import { Router } from "express";
import {
  createTicketComment,
  createInternalNote,
  getTicketHistory,
  listTicketComments,
} from "../controllers/ticketConversationController.js";
import { authorizeRoles } from "../middleware/authorizeRoles.js";
import {
  authorizeInternalNote,
  requireTicketParticipantOrAdmin,
} from "../middleware/ticketAccess.js";
import {
  validateCommentListQuery,
  validateCreateComment,
} from "../validators/commentValidators.js";
import { validateTicketId } from "../validators/ticketValidators.js";

// Bật mergeParams để truy cập được req.params.ticketId từ router cha (ticketRoutes)
const router = Router({ mergeParams: true });

// GET /comments - Lấy danh sách trao đổi của ticket (phân trang, sắp xếp)
// Luồng xử lý: Kiểm tra vai trò -> validate ticketId -> validate query phân trang -> kiểm tra quyền tham gia ticket -> controller
router.get(
  "/comments",
  authorizeRoles("user", "technician", "admin"),
  validateTicketId,
  validateCommentListQuery,
  requireTicketParticipantOrAdmin,
  listTicketComments,
);

// POST /comments - Gửi bình luận trao đổi công khai trên ticket
// Phân quyền: Chỉ user (người tạo) hoặc technician (người được phân công) tham gia trao đổi
router.post(
  "/comments",
  authorizeRoles("user", "technician"),
  validateTicketId,
  requireTicketParticipantOrAdmin,
  validateCreateComment,
  createTicketComment,
);

// POST /internal-notes - Tạo ghi chú nội bộ trên ticket (ẩn hoàn toàn với user cuối)
// Phân quyền: Chỉ technician -> kiểm tra quyền truy cập ticket -> validate nội dung -> authorizeInternalNote -> controller
router.post(
  "/internal-notes",
  authorizeRoles("technician"),
  validateTicketId,
  requireTicketParticipantOrAdmin,
  validateCreateComment,
  authorizeInternalNote,
  createInternalNote,
);

// GET /history - Xem dòng thời gian lịch sử thay đổi trạng thái và phân công của ticket
// Phân quyền: user, technician, admin có liên quan đến ticket (kiểm tra qua requireTicketParticipantOrAdmin)
router.get(
  "/history",
  authorizeRoles("user", "technician", "admin"),
  validateTicketId,
  requireTicketParticipantOrAdmin,
  getTicketHistory,
);

export default router;
