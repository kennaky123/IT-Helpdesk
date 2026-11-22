/**
 * @file categoryRoutes.js
 * @description Định nghĩa Express Router quản lý danh mục sự cố/ticket (Category).
 * Vai trò trong kiến trúc Backend: Thuộc tầng Router (Express Router), gắn dưới tiền tố `/api/categories`.
 * Tách biệt nhóm endpoint quản trị (`/admin`) dành riêng cho Admin và endpoint tra cứu danh mục hoạt động (`/`)
 * cho toàn bộ người dùng đã đăng nhập.
 */
import { Router } from "express";
import {
  createCategory,
  deleteCategory,
  listActiveCategories,
  listAdminCategories,
  updateCategory,
} from "../controllers/categoryController.js";
import { authenticate } from "../middleware/authenticate.js";
import { authorizeRoles } from "../middleware/authorizeRoles.js";
import { validateCategory, validateObjectId } from "../validators/adminValidators.js";

const router = Router();

// GET /admin - Lấy toàn bộ danh mục (bao gồm cả danh mục đang ẩn) dành riêng cho Admin
router.get("/admin", authenticate, authorizeRoles("admin"), listAdminCategories);

// POST /admin - Tạo danh mục mới; chỉ Admin được phép, validate tên/mô tả/trạng thái trước khi lưu
router.post("/admin", authenticate, authorizeRoles("admin"), validateCategory, createCategory);

// PATCH /admin/:categoryId - Cập nhật thông tin danh mục theo ID; chỉ Admin, kiểm tra ObjectId và body hợp lệ
router.patch("/admin/:categoryId", authenticate, authorizeRoles("admin"), validateObjectId("categoryId"), validateCategory, updateCategory);

// DELETE /admin/:categoryId - Xóa danh mục theo ID; chỉ Admin, kiểm tra ObjectId trước khi thực thi
router.delete("/admin/:categoryId", authenticate, authorizeRoles("admin"), validateObjectId("categoryId"), deleteCategory);

// GET / - Lấy danh sách các danh mục đang kích hoạt (`isActive: true`) để hiển thị khi tạo/lọc Ticket
// Phân quyền: Tất cả vai trò đã xác thực (user, technician, admin)
router.get(
  "/",
  authenticate,
  authorizeRoles("user", "technician", "admin"),
  listActiveCategories,
);

export default router;
