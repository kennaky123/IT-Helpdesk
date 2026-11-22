/**
 * @file softwareRoutes.js
 * @description Định nghĩa Express Router quản lý bản quyền phần mềm (Software License) và phân tích chi phí FinOps.
 * Vai trò trong kiến trúc Backend: Thuộc tầng Router (Express Router), gắn dưới tiền tố `/api/software`.
 * Áp dụng xác thực JWT, kiểm tra phân quyền theo vai trò (`admin`, `technician`, `user`) và validate dữ liệu đầu vào.
 * Lưu ý thứ tự route: Khai báo `/finops` trước `/:licenseId` để tránh Express hiểu nhầm "finops" là một licenseId.
 */
import { Router } from "express";
import {
  allocateLicense,
  createSoftwareLicense,
  deleteSoftwareLicense,
  getFinOpsSummary,
  getSoftwareLicense,
  listSoftwareLicenses,
  revokeLicense,
  updateSoftwareLicense,
} from "../controllers/softwareController.js";
import { authenticate } from "../middleware/authenticate.js";
import { authorizeRoles } from "../middleware/authorizeRoles.js";
import {
  validateAllocateLicense,
  validateRevokeLicense,
  validateSoftwareBody,
  validateSoftwareId,
  validateSoftwareQuery,
} from "../validators/softwareValidators.js";

const router = Router();

// GET /finops - Thống kê tổng quan chi phí phần mềm, tỷ lệ sử dụng seat và các gói sắp hết hạn
// Phân quyền: Chỉ admin và technician
router.get(
  "/finops",
  authenticate,
  authorizeRoles("admin", "technician"),
  getFinOpsSummary,
);

// GET / - Lấy danh sách bản quyền phần mềm (hỗ trợ lọc theo category, type, status, search)
// Phân quyền: admin, technician (xem tất cả), user (controller lọc theo phần mềm được cấp cho nhân viên)
router.get(
  "/",
  authenticate,
  authorizeRoles("admin", "technician", "user"),
  validateSoftwareQuery,
  listSoftwareLicenses,
);

// POST / - Tạo mới bản quyền phần mềm
// Phân quyền: Chỉ admin -> validateSoftwareBody(true) bắt buộc các trường tạo mới -> createSoftwareLicense
router.post(
  "/",
  authenticate,
  authorizeRoles("admin"),
  validateSoftwareBody(true),
  createSoftwareLicense,
);

// GET /:licenseId - Xem chi tiết một bản quyền phần mềm và danh sách nhân viên được cấp seat
// Phân quyền: admin, technician, user -> validateSoftwareId kiểm tra ObjectId hợp lệ
router.get(
  "/:licenseId",
  authenticate,
  authorizeRoles("admin", "technician", "user"),
  validateSoftwareId,
  getSoftwareLicense,
);

// PATCH /:licenseId - Cập nhật thông tin bản quyền phần mềm (cập nhật từng phần)
// Phân quyền: admin hoặc technician -> validateSoftwareId -> validateSoftwareBody(false)
router.patch(
  "/:licenseId",
  authenticate,
  authorizeRoles("admin", "technician"),
  validateSoftwareId,
  validateSoftwareBody(false),
  updateSoftwareLicense,
);

// DELETE /:licenseId - Xóa bản ghi bản quyền phần mềm
// Phân quyền: Chỉ admin -> kiểm tra ObjectId -> deleteSoftwareLicense
router.delete(
  "/:licenseId",
  authenticate,
  authorizeRoles("admin"),
  validateSoftwareId,
  deleteSoftwareLicense,
);

// POST /:licenseId/allocate - Cấp phát một seat bản quyền phần mềm cho nhân viên
// Phân quyền: admin hoặc technician -> kiểm tra licenseId và userId cần cấp -> allocateLicense
router.post(
  "/:licenseId/allocate",
  authenticate,
  authorizeRoles("admin", "technician"),
  validateSoftwareId,
  validateAllocateLicense,
  allocateLicense,
);

// POST /:licenseId/revoke - Thu hồi seat bản quyền phần mềm từ nhân viên
// Phân quyền: admin hoặc technician -> kiểm tra licenseId và userId cần thu hồi -> revokeLicense
router.post(
  "/:licenseId/revoke",
  authenticate,
  authorizeRoles("admin", "technician"),
  validateSoftwareId,
  validateRevokeLicense,
  revokeLicense,
);

export default router;
