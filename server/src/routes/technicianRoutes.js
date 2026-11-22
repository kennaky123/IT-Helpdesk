/**
 * @file technicianRoutes.js
 * @description Định nghĩa Express Router quản lý và tra cứu đội ngũ kỹ thuật viên (Technicians).
 * Vai trò trong kiến trúc Backend: Thuộc tầng Router (Express Router), gắn dưới tiền tố `/api/technicians`.
 * Cung cấp endpoint tra cứu kỹ thuật viên đang hoạt động cho toàn bộ người dùng và nhóm endpoint `/admin`
 * dành riêng cho Admin thêm, sửa, xóa hồ sơ kỹ thuật viên.
 */
import { Router } from "express";
import {
  createTechnician,
  deleteTechnician,
  listActiveTechnicians,
  listAdminTechnicians,
  updateTechnician,
} from "../controllers/technicianController.js";
import { authenticate } from "../middleware/authenticate.js";
import { authorizeRoles } from "../middleware/authorizeRoles.js";
import { validateObjectId, validateTechnician } from "../validators/adminValidators.js";

const router = Router();

// GET / - Lấy danh sách kỹ thuật viên đang hoạt động (dùng khi phân công hoặc chọn KTV hỗ trợ)
// Phân quyền: Tất cả vai trò đã xác thực (admin, user, technician)
router.get(
  "/",
  authenticate,
  authorizeRoles("admin", "user", "technician"),
  listActiveTechnicians,
);

// GET /admin - Lấy danh sách toàn bộ kỹ thuật viên (bao gồm trạng thái, chuyên môn) cho trang quản trị Admin
router.get("/admin", authenticate, authorizeRoles("admin"), listAdminTechnicians);

// POST /admin - Tạo mới tài khoản kỹ thuật viên; chỉ Admin, validate đầy đủ thông tin và mật khẩu
router.post("/admin", authenticate, authorizeRoles("admin"), validateTechnician, createTechnician);

// PATCH /admin/:technicianId - Cập nhật thông tin kỹ thuật viên; chỉ Admin, kiểm tra ObjectId và body đầu vào
router.patch("/admin/:technicianId", authenticate, authorizeRoles("admin"), validateObjectId("technicianId"), validateTechnician, updateTechnician);

// DELETE /admin/:technicianId - Xóa kỹ thuật viên theo ID; chỉ Admin, kiểm tra định dạng ObjectId
router.delete("/admin/:technicianId", authenticate, authorizeRoles("admin"), validateObjectId("technicianId"), deleteTechnician);

export default router;
