/**
 * @file realtimeRoutes.js
 * @description Định nghĩa Express Router cho kênh truyền sự kiện thời gian thực (Realtime / SSE).
 * Vai trò trong kiến trúc Backend: Thuộc tầng Router (Express Router), gắn dưới tiền tố `/api/events`,
 * cho phép client đã xác thực mở kết nối nhận cập nhật tức thì về ticket, thông báo và trạng thái hệ thống.
 */
import { Router } from "express";
import { getRealtimeEvents } from "../controllers/realtimeController.js";
import { authenticate } from "../middleware/authenticate.js";
import { authorizeRoles } from "../middleware/authorizeRoles.js";

const router = Router();

// GET / - Thiết lập kết nối nhận sự kiện thời gian thực cho người dùng đã đăng nhập (user, technician, admin)
router.get("/", authenticate, authorizeRoles("user", "technician", "admin"), getRealtimeEvents);
export default router;
