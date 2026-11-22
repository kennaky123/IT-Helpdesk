/**
 * @file dashboardRoutes.js
 * @description Định nghĩa Express Router cung cấp dữ liệu tổng quan & thống kê KPI cho trang Dashboard.
 * Vai trò trong kiến trúc Backend: Thuộc tầng Router (Express Router), gắn dưới tiền tố `/api/dashboard`.
 * Yêu cầu xác thực JWT cho tất cả route và tách riêng endpoint dữ liệu theo từng vai trò (`user`, `technician`, `admin`).
 */
import { Router } from "express";
import {
  getDashboard,
  getTechnicianDashboardData,
  getUserDashboardData,
} from "../controllers/dashboardController.js";
import { authenticate } from "../middleware/authenticate.js";
import { authorizeRoles } from "../middleware/authorizeRoles.js";

const router = Router();

// Middleware cấp router: Bắt buộc xác thực JWT cho mọi endpoint thống kê dashboard
router.use(authenticate);

// GET /user - Lấy số liệu tổng quan ticket và tài sản của nhân viên (chỉ role "user")
router.get("/user", authorizeRoles("user"), getUserDashboardData);

// GET /technician - Lấy số liệu công việc, SLA và đánh giá dành cho kỹ thuật viên (chỉ role "technician")
router.get("/technician", authorizeRoles("technician"), getTechnicianDashboardData);

// GET / - Lấy thống kê tổng thể toàn hệ thống dành cho quản trị viên (chỉ role "admin")
router.get("/", authorizeRoles("admin"), getDashboard);

export default router;
