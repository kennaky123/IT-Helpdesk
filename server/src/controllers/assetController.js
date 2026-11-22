/**
 * @file assetController.js
 * @description Controller quản lý thiết bị CNTT (Asset) và yêu cầu cấp phát thiết bị (Asset Request).
 * Vai trò Controller: Tiếp nhận HTTP request từ các endpoint quản lý tài sản, ủy quyền
 * xử lý nghiệp vụ cho `assetService`, phát sự kiện cập nhật realtime (`publishDataChanged`)
 * khi dữ liệu thay đổi và trả về HTTP response định dạng JSON thống nhất.
 */
import { publishDataChanged } from "../services/realtimeService.js";
import * as assetService from "../services/assetService.js";

/**
 * Lấy danh sách thiết bị theo bộ lọc truy vấn và phân quyền người dùng.
 *
 * @param {import("express").Request} request - HTTP request chứa `assetQuery` đã validate và thông tin `user`.
 * @param {import("express").Response} response - HTTP response trả về danh sách thiết bị và thống kê.
 * @param {import("express").NextFunction} next - Middleware chuyển tiếp lỗi.
 * @returns {Promise<import("express").Response|void>} JSON response HTTP 200.
 */
export async function listAssets(request, response, next) {
  try {
    const data = await assetService.listAssets(request.assetQuery, request.user);
    return response.status(200).json({
      success: true,
      message: "Lấy danh sách thiết bị thành công.",
      data,
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Lấy thông tin chi tiết của một thiết bị theo ID (bao gồm lịch sử cấp phát/thu hồi).
 *
 * @param {import("express").Request} request - HTTP request chứa `params.assetId` và `user`.
 * @param {import("express").Response} response - HTTP response trả về chi tiết thiết bị.
 * @param {import("express").NextFunction} next - Middleware chuyển tiếp lỗi.
 * @returns {Promise<import("express").Response|void>} JSON response HTTP 200.
 */
export async function getAsset(request, response, next) {
  try {
    const asset = await assetService.getAsset(request.params.assetId, request.user);
    return response.status(200).json({
      success: true,
      message: "Lấy thông tin thiết bị thành công.",
      data: { asset },
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Thêm mới thiết bị vào kho tài sản CNTT và phát thông báo realtime.
 *
 * @param {import("express").Request} request - HTTP request chứa dữ liệu thiết bị mới trong `body`.
 * @param {import("express").Response} response - HTTP response trả về thiết bị vừa tạo.
 * @param {import("express").NextFunction} next - Middleware chuyển tiếp lỗi.
 * @returns {Promise<import("express").Response|void>} JSON response HTTP 201.
 */
export async function createAsset(request, response, next) {
  try {
    const asset = await assetService.createAsset(request.body, request.user);
    // Thông báo cho các client SSE đồng bộ lại dữ liệu thiết bị
    publishDataChanged("assets");
    return response.status(201).json({
      success: true,
      message: "Thêm thiết bị vào kho thành công.",
      data: { asset },
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Cập nhật thông tin chi tiết hoặc trạng thái kho/bảo trì của thiết bị.
 *
 * @param {import("express").Request} request - HTTP request chứa `params.assetId` và payload cập nhật trong `body`.
 * @param {import("express").Response} response - HTTP response trả về thiết bị sau cập nhật.
 * @param {import("express").NextFunction} next - Middleware chuyển tiếp lỗi.
 * @returns {Promise<import("express").Response|void>} JSON response HTTP 200.
 */
export async function updateAsset(request, response, next) {
  try {
    const asset = await assetService.updateAsset(request.params.assetId, request.body, request.user);
    publishDataChanged("assets");
    return response.status(200).json({
      success: true,
      message: "Cập nhật thông tin thiết bị thành công.",
      data: { asset },
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Xóa thiết bị khỏi hệ thống (chỉ cho phép khi không đang được sử dụng).
 *
 * @param {import("express").Request} request - HTTP request chứa `params.assetId`.
 * @param {import("express").Response} response - HTTP response xác nhận xóa.
 * @param {import("express").NextFunction} next - Middleware chuyển tiếp lỗi.
 * @returns {Promise<import("express").Response|void>} JSON response HTTP 200.
 */
export async function deleteAsset(request, response, next) {
  try {
    await assetService.deleteAsset(request.params.assetId);
    publishDataChanged("assets");
    return response.status(200).json({
      success: true,
      message: "Xóa thiết bị thành công.",
      data: null,
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Cấp phát thiết bị trong kho cho một nhân viên cụ thể.
 *
 * @param {import("express").Request} request - HTTP request chứa `params.assetId` và `{ userId, note }` trong `body`.
 * @param {import("express").Response} response - HTTP response trả về thiết bị sau khi cấp phát.
 * @param {import("express").NextFunction} next - Middleware chuyển tiếp lỗi.
 * @returns {Promise<import("express").Response|void>} JSON response HTTP 200.
 */
export async function assignAsset(request, response, next) {
  try {
    const asset = await assetService.assignAsset(request.params.assetId, request.body, request.user);
    publishDataChanged("assets");
    return response.status(200).json({
      success: true,
      message: `Cấp phát thiết bị ${asset.assetTag} thành công.`,
      data: { asset },
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Thu hồi thiết bị đang được nhân viên sử dụng về kho hoặc chuyển sang bảo trì.
 *
 * @param {import("express").Request} request - HTTP request chứa `params.assetId` và `{ note, status }` trong `body`.
 * @param {import("express").Response} response - HTTP response trả về thiết bị sau thu hồi.
 * @param {import("express").NextFunction} next - Middleware chuyển tiếp lỗi.
 * @returns {Promise<import("express").Response|void>} JSON response HTTP 200.
 */
export async function returnAsset(request, response, next) {
  try {
    const asset = await assetService.returnAsset(request.params.assetId, request.body, request.user);
    publishDataChanged("assets");
    return response.status(200).json({
      success: true,
      message: `Thu hồi thiết bị ${asset.assetTag} về kho thành công.`,
      data: { asset },
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Lấy danh sách nhân viên và kỹ thuật viên đang hoạt động đủ điều kiện nhận cấp phát thiết bị.
 *
 * @param {import("express").Request} _request - HTTP request (không sử dụng).
 * @param {import("express").Response} response - HTTP response trả về danh sách nhân viên.
 * @param {import("express").NextFunction} next - Middleware chuyển tiếp lỗi.
 * @returns {Promise<import("express").Response|void>} JSON response HTTP 200.
 */
export async function listAssignableEmployees(_request, response, next) {
  try {
    const employees = await assetService.listAssignableEmployees();
    return response.status(200).json({
      success: true,
      message: "Lấy danh sách nhân viên thành công.",
      data: { employees },
    });
  } catch (error) {
    return next(error);
  }
}

/* ------------------------ Asset Requests ------------------------ */

/**
 * Lấy danh sách yêu cầu cấp phát thiết bị theo bộ lọc và vai trò người dùng.
 *
 * @param {import("express").Request} request - HTTP request chứa `assetRequestQuery` và `user`.
 * @param {import("express").Response} response - HTTP response trả về danh sách yêu cầu cấp phát.
 * @param {import("express").NextFunction} next - Middleware chuyển tiếp lỗi.
 * @returns {Promise<import("express").Response|void>} JSON response HTTP 200.
 */
export async function listAssetRequests(request, response, next) {
  try {
    const requests = await assetService.listAssetRequests(request.assetRequestQuery, request.user);
    return response.status(200).json({
      success: true,
      message: "Lấy danh sách yêu cầu cấp phát thành công.",
      data: { requests },
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Tạo mới yêu cầu cấp phát thiết bị cho nhân viên.
 *
 * @param {import("express").Request} request - HTTP request chứa dữ liệu yêu cầu trong `body`.
 * @param {import("express").Response} response - HTTP response trả về yêu cầu vừa tạo.
 * @param {import("express").NextFunction} next - Middleware chuyển tiếp lỗi.
 * @returns {Promise<import("express").Response|void>} JSON response HTTP 201.
 */
export async function createAssetRequest(request, response, next) {
  try {
    const assetRequest = await assetService.createAssetRequest(request.body, request.user);
    publishDataChanged("assets");
    return response.status(201).json({
      success: true,
      message: "Gửi yêu cầu cấp phát thiết bị thành công.",
      data: { request: assetRequest },
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Kỹ thuật viên tiếp nhận xử lý một yêu cầu cấp phát thiết bị đang chờ.
 *
 * @param {import("express").Request} request - HTTP request chứa `params.requestId`.
 * @param {import("express").Response} response - HTTP response trả về yêu cầu đã được tiếp nhận.
 * @param {import("express").NextFunction} next - Middleware chuyển tiếp lỗi.
 * @returns {Promise<import("express").Response|void>} JSON response HTTP 200.
 */
export async function acceptAssetRequest(request, response, next) {
  try {
    const assetRequest = await assetService.acceptAssetRequest(request.params.requestId, request.user);
    publishDataChanged("assets");
    return response.status(200).json({
      success: true,
      message: "Đã tiếp nhận yêu cầu cấp phát.",
      data: { request: assetRequest },
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Hoàn tất yêu cầu cấp phát bằng cách gán và bàn giao một thiết bị cụ thể cho nhân viên.
 *
 * @param {import("express").Request} request - HTTP request chứa `params.requestId` và `{ assetId, note }`.
 * @param {import("express").Response} response - HTTP response trả về yêu cầu đã hoàn tất.
 * @param {import("express").NextFunction} next - Middleware chuyển tiếp lỗi.
 * @returns {Promise<import("express").Response|void>} JSON response HTTP 200.
 */
export async function completeAssetRequest(request, response, next) {
  try {
    const assetRequest = await assetService.completeAssetRequest(
      request.params.requestId,
      request.body,
      request.user,
    );
    publishDataChanged("assets");
    return response.status(200).json({
      success: true,
      message: "Bàn giao thiết bị cho nhân viên thành công.",
      data: { request: assetRequest },
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Hủy yêu cầu cấp phát thiết bị chưa hoàn tất kèm lý do hủy.
 *
 * @param {import("express").Request} request - HTTP request chứa `params.requestId` và `body.reason`.
 * @param {import("express").Response} response - HTTP response trả về yêu cầu đã hủy.
 * @param {import("express").NextFunction} next - Middleware chuyển tiếp lỗi.
 * @returns {Promise<import("express").Response|void>} JSON response HTTP 200.
 */
export async function cancelAssetRequest(request, response, next) {
  try {
    const assetRequest = await assetService.cancelAssetRequest(request.params.requestId, request.body);
    publishDataChanged("assets");
    return response.status(200).json({
      success: true,
      message: "Đã hủy yêu cầu cấp phát.",
      data: { request: assetRequest },
    });
  } catch (error) {
    return next(error);
  }
}
