/**
 * @file usbRoutes.js
 * @description Định nghĩa Express Router quản lý bảo mật thiết bị USB và giao tiếp với Windows USB Agent.
 * Vai trò trong kiến trúc Backend: Thuộc tầng Router (Express Router), gắn dưới tiền tố `/api/usb`.
 * Chia làm 2 nhóm rõ rệt: nhóm endpoint công khai phục vụ Agent chạy trên máy trạm đồng bộ chính sách/sự kiện,
 * và nhóm endpoint bảo vệ bằng JWT dành cho Admin & Technician giám sát, phê duyệt hoặc chặn USB.
 */
import { Router } from "express";
import {
  handleAgentGetPolicies,
  handleAgentPing,
  handleAgentUsbEvent,
  handleDeleteUsbDevice,
  handleDownloadAgent,
  handleGetNetworkInfo,
  handleGetUsbDashboard,
  handleUpdateUsbPolicy,
} from "../controllers/usbController.js";
import { authenticate } from "../middleware/authenticate.js";
import { authorizeRoles } from "../middleware/authorizeRoles.js";
import {
  validateAgentUsbEvent,
  validateUpdateUsbPolicy,
  validateUsbId,
  validateUsbQuery,
} from "../validators/usbValidators.js";

const router = Router();

// Public / Agent endpoints cho ITHelpdeskUSBAgent.exe gửi dữ liệu từ máy nhân viên
// GET /agent-ping - Kiểm tra kết nối giữa Windows Agent trên máy nhân viên và backend
router.get("/agent-ping", handleAgentPing);

// GET /agent-policies - Agent tải danh sách chính sách USB (trusted/blocked) để thực thi chặn tại máy trạm
router.get("/agent-policies", handleAgentGetPolicies);

// POST /agent-event - Agent gửi sự kiện cắm/rút USB lên server; validate định dạng sự kiện trước khi lưu log
router.post("/agent-event", validateAgentUsbEvent, handleAgentUsbEvent);

// GET /download-agent - Cho phép tải bộ cài đặt hoặc script cấu hình USB Agent
router.get("/download-agent", handleDownloadAgent);

// Protected endpoints cho Admin & Technician
// GET /network-info - Lấy thông tin địa chỉ IP/cổng kết nối mạng LAN để hướng dẫn cấu hình Agent
// Phân quyền: admin hoặc technician
router.get(
  "/network-info",
  authenticate,
  authorizeRoles("admin", "technician"),
  handleGetNetworkInfo,
);

// GET / - Lấy dữ liệu tổng hợp dashboard USB (danh sách thiết bị, log sự kiện gần nhất, thống kê)
// Phân quyền: admin hoặc technician -> validateUsbQuery lọc dữ liệu đầu vào
router.get(
  "/",
  authenticate,
  authorizeRoles("admin", "technician"),
  validateUsbQuery,
  handleGetUsbDashboard,
);

// PATCH /:usbId/policy - Cập nhật chính sách bảo mật USB (trusted/unverified/blocked), gán người dùng và ghi chú
// Phân quyền: admin hoặc technician -> kiểm tra usbId & payload chính sách
router.patch(
  "/:usbId/policy",
  authenticate,
  authorizeRoles("admin", "technician"),
  validateUsbId,
  validateUpdateUsbPolicy,
  handleUpdateUsbPolicy,
);

// DELETE /:usbId - Xóa bản ghi thiết bị USB khỏi hệ thống quản lý
// Phân quyền: Chỉ admin -> kiểm tra usbId hợp lệ trước khi xóa
router.delete(
  "/:usbId",
  authenticate,
  authorizeRoles("admin"),
  validateUsbId,
  handleDeleteUsbDevice,
);

export default router;
