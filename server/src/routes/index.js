/**
 * @file index.js
 * @description Tập trung cấu hình và gắn kết (mount) toàn bộ các sub-router của API vào router gốc.
 * Vai trò trong kiến trúc Backend: Thuộc tầng Router (Root API Router), đóng vai trò cổng điều phối trung tâm
 * dưới tiền tố `/api`, ánh xạ từng tiền tố tài nguyên tới module router chuyên trách tương ứng.
 */
import { Router } from "express";
import { getHealth } from "../controllers/healthController.js";
import authRoutes from "./authRoutes.js";
import adminUserRoutes from "./adminUserRoutes.js";
import categoryRoutes from "./categoryRoutes.js";
import dashboardRoutes from "./dashboardRoutes.js";
import technicianRoutes from "./technicianRoutes.js";
import ticketRoutes from "./ticketRoutes.js";
import realtimeRoutes from "./realtimeRoutes.js";
import assetRoutes from "./assetRoutes.js";
import softwareRoutes from "./softwareRoutes.js";
import usbRoutes from "./usbRoutes.js";

const router = Router();

// Endpoint kiểm tra tình trạng hoạt động của server và kết nối cơ sở dữ liệu
router.get("/health", getHealth);

// Nhóm API xác thực, đăng nhập, đăng ký và hồ sơ cá nhân
router.use("/auth", authRoutes);

// Nhóm API quản trị tài khoản người dùng (Admin)
router.use("/admin/users", adminUserRoutes);

// Nhóm API quản lý tài sản phần cứng IT và yêu cầu cấp phát thiết bị
router.use("/assets", assetRoutes);

// Nhóm API quản lý bản quyền phần mềm và thống kê chi phí FinOps
router.use("/software", softwareRoutes);

// Nhóm API giám sát bảo mật USB và giao tiếp với Windows USB Agent
router.use("/usb", usbRoutes);

// Nhóm API danh mục sự cố / ticket
router.use("/categories", categoryRoutes);

// Nhóm API thống kê Dashboard theo từng vai trò
router.use("/dashboard", dashboardRoutes);

// Nhóm API luồng sự kiện thời gian thực (Server-Sent Events / Realtime)
router.use("/events", realtimeRoutes);

// Nhóm API quản lý và tra cứu danh sách kỹ thuật viên
router.use("/technicians", technicianRoutes);

// Nhóm API nghiệp vụ cốt lõi xử lý Ticket, đính kèm và hội thoại
router.use("/tickets", ticketRoutes);

export default router;
