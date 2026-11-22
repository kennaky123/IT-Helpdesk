/**
 * @file assetRoutes.js
 * @description Định nghĩa Express Router cho nghiệp vụ quản lý tài sản IT (Assets) và yêu cầu cấp phát thiết bị (Asset Requests).
 * Vai trò trong kiến trúc Backend: Thuộc tầng Router (Express Router), gắn dưới tiền tố `/api/assets`.
 * Kiểm soát chặt chẽ xác thực JWT, phân quyền theo vai trò (`admin`, `technician`, `user`) và validate dữ liệu đầu vào.
 * Lưu ý thứ tự route: Khai báo các route tĩnh (`/requests`, `/employees`) trước route động (`/:assetId`) để tránh xung đột tham số.
 */
import { Router } from "express";
import {
  acceptAssetRequest,
  assignAsset,
  cancelAssetRequest,
  completeAssetRequest,
  createAsset,
  createAssetRequest,
  deleteAsset,
  getAsset,
  listAssetRequests,
  listAssets,
  listAssignableEmployees,
  returnAsset,
  updateAsset,
} from "../controllers/assetController.js";
import { authenticate } from "../middleware/authenticate.js";
import { authorizeRoles } from "../middleware/authorizeRoles.js";
import {
  validateAssetBody,
  validateAssetId,
  validateAssetQuery,
  validateAssignAsset,
  validateCancelAssetRequest,
  validateCompleteAssetRequest,
  validateCreateAssetRequest,
  validateRequestQuery,
  validateReturnAsset,
} from "../validators/assetValidators.js";

const router = Router();

/* ------------------------ Asset Requests ------------------------ */

// GET /requests - Lấy danh sách yêu cầu cấp phát thiết bị
// Phân quyền: admin, technician (xem tất cả), user (chỉ xem yêu cầu cấp cho chính mình trong controller)
router.get(
  "/requests",
  authenticate,
  authorizeRoles("admin", "technician", "user"),
  validateRequestQuery,
  listAssetRequests,
);

// POST /requests - Tạo yêu cầu cấp phát thiết bị mới cho nhân viên
// Phân quyền: Chỉ admin được khởi tạo yêu cầu cấp phát -> validate body -> createAssetRequest
router.post(
  "/requests",
  authenticate,
  authorizeRoles("admin"),
  validateCreateAssetRequest,
  createAssetRequest,
);

// POST /requests/:requestId/accept - Kỹ thuật viên tiếp nhận xử lý một yêu cầu cấp phát đang chờ
// Phân quyền: Chỉ technician -> kiểm tra ObjectId hợp lệ -> acceptAssetRequest
router.post(
  "/requests/:requestId/accept",
  authenticate,
  authorizeRoles("technician"),
  validateAssetId,
  acceptAssetRequest,
);

// POST /requests/:requestId/complete - Hoàn tất yêu cầu và bàn giao thiết bị cụ thể từ kho cho nhân viên
// Phân quyền: admin hoặc technician -> validate requestId & assetId bàn giao -> completeAssetRequest
router.post(
  "/requests/:requestId/complete",
  authenticate,
  authorizeRoles("admin", "technician"),
  validateAssetId,
  validateCompleteAssetRequest,
  completeAssetRequest,
);

// POST /requests/:requestId/cancel - Hủy yêu cầu cấp phát thiết bị kèm lý do
// Phân quyền: admin hoặc technician -> validate requestId & lý do hủy -> cancelAssetRequest
router.post(
  "/requests/:requestId/cancel",
  authenticate,
  authorizeRoles("admin", "technician"),
  validateAssetId,
  validateCancelAssetRequest,
  cancelAssetRequest,
);

/* ------------------------ Assets ------------------------ */

// GET /employees - Lấy danh sách nhân viên khả dụng để cấp phát thiết bị
// Phân quyền: admin và technician
router.get(
  "/employees",
  authenticate,
  authorizeRoles("admin", "technician"),
  listAssignableEmployees,
);

// GET / - Lấy danh sách thiết bị IT (hỗ trợ lọc theo status, type, assignedTo, từ khóa)
// Phân quyền: Tất cả các vai trò đã đăng nhập (user chỉ thấy thiết bị được cấp cho mình)
router.get(
  "/",
  authenticate,
  authorizeRoles("admin", "technician", "user"),
  validateAssetQuery,
  listAssets,
);

// POST / - Tạo mới thiết bị IT trong kho
// Phân quyền: Chỉ admin -> validateAssetBody(true) bắt buộc đầy đủ trường tạo mới -> createAsset
router.post(
  "/",
  authenticate,
  authorizeRoles("admin"),
  validateAssetBody(true),
  createAsset,
);

// GET /:assetId - Xem chi tiết một thiết bị kèm lịch sử vòng đời
// Phân quyền: admin, technician, user (controller kiểm tra quyền sở hữu đối với user)
router.get(
  "/:assetId",
  authenticate,
  authorizeRoles("admin", "technician", "user"),
  validateAssetId,
  getAsset,
);

// PATCH /:assetId - Cập nhật thông tin thiết bị (trừ các trường khóa)
// Phân quyền: admin hoặc technician -> validateAssetId -> validateAssetBody(false) cho phép cập nhật từng phần
router.patch(
  "/:assetId",
  authenticate,
  authorizeRoles("admin", "technician"),
  validateAssetId,
  validateAssetBody(false),
  updateAsset,
);

// DELETE /:assetId - Xóa thiết bị khỏi hệ thống
// Phân quyền: Chỉ admin -> kiểm tra ObjectId -> deleteAsset
router.delete(
  "/:assetId",
  authenticate,
  authorizeRoles("admin"),
  validateAssetId,
  deleteAsset,
);

// POST /:assetId/assign - Cấp phát trực tiếp thiết bị cho một nhân viên
// Phân quyền: admin hoặc technician -> kiểm tra assetId & userId nhận máy -> assignAsset
router.post(
  "/:assetId/assign",
  authenticate,
  authorizeRoles("admin", "technician"),
  validateAssetId,
  validateAssignAsset,
  assignAsset,
);

// POST /:assetId/return - Thu hồi thiết bị từ nhân viên về kho hoặc chuyển bảo trì
// Phân quyền: admin hoặc technician -> kiểm tra assetId & trạng thái thu hồi -> returnAsset
router.post(
  "/:assetId/return",
  authenticate,
  authorizeRoles("admin", "technician"),
  validateAssetId,
  validateReturnAsset,
  returnAsset,
);

export default router;
