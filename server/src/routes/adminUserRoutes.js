/**
 * @file adminUserRoutes.js
 * @description Định nghĩa Express Router quản lý tài khoản người dùng dành cho Quản trị viên (Admin).
 * Vai trò trong kiến trúc Backend: Thuộc tầng Router (Express Router), gắn dưới tiền tố `/api/admin/users`,
 * áp dụng xác thực JWT và phân quyền bắt buộc `admin` cho toàn bộ các endpoint CRUD người dùng.
 */
import { Router } from "express";
import {
  createAdminUser,
  deleteAdminUser,
  listAdminUsers,
  updateAdminUser,
  updateAdminUserStatus,
} from "../controllers/adminUserController.js";
import { authenticate } from "../middleware/authenticate.js";
import { authorizeRoles } from "../middleware/authorizeRoles.js";
import {
  validateAdminUser,
  validateAdminUserStatus,
  validateObjectId,
} from "../validators/adminValidators.js";

const router = Router();

// Middleware cấp router: Yêu cầu xác thực JWT và chỉ cho phép vai trò "admin" truy cập toàn bộ route bên dưới
router.use(authenticate, authorizeRoles("admin"));

// GET / - Lấy danh sách người dùng hệ thống (phân trang, tìm kiếm, lọc theo vai trò/trạng thái)
router.get("/", listAdminUsers);

// POST / - Tạo tài khoản người dùng mới; chạy middleware validateAdminUser trước khi vào controller
router.post("/", validateAdminUser, createAdminUser);

// PATCH /:userId - Cập nhật thông tin tài khoản người dùng; kiểm tra ObjectId hợp lệ và validate dữ liệu đầu vào
router.patch("/:userId", validateObjectId("userId"), validateAdminUser, updateAdminUser);

// PATCH /:userId/status - Khóa hoặc kích hoạt lại tài khoản người dùng; validate ID và trạng thái mới
router.patch(
  "/:userId/status",
  validateObjectId("userId"),
  validateAdminUserStatus,
  updateAdminUserStatus,
);

// DELETE /:userId - Xóa tài khoản người dùng theo ID; kiểm tra định dạng ObjectId trước khi xử lý
router.delete("/:userId", validateObjectId("userId"), deleteAdminUser);

export default router;
