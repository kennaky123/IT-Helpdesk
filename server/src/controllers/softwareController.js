/**
 * @file softwareController.js
 * @description Controller quản lý bản quyền phần mềm (Software License) và báo cáo FinOps CNTT.
 * Vai trò Controller: Tiếp nhận HTTP request CRUD bản quyền phần mềm, cấp phát/thu hồi license
 * cho nhân viên và xem thống kê chi phí FinOps; gọi `softwareService` xử lý nghiệp vụ,
 * phát sự kiện realtime `"software"` khi có thay đổi và trả về JSON response.
 */
import { publishDataChanged } from "../services/realtimeService.js";
import * as softwareService from "../services/softwareService.js";

/**
 * Lấy danh sách bản quyền phần mềm kèm thống kê FinOps (tùy theo vai trò người dùng).
 *
 * @param {import("express").Request} request - HTTP request chứa `softwareQuery` và thông tin `user`.
 * @param {import("express").Response} response - HTTP response trả về danh sách bản quyền và dữ liệu FinOps.
 * @param {import("express").NextFunction} next - Middleware chuyển tiếp lỗi.
 * @returns {Promise<import("express").Response|void>} JSON response HTTP 200.
 */
export async function listSoftwareLicenses(request, response, next) {
  try {
    const data = await softwareService.listSoftwareLicenses(
      request.softwareQuery,
      request.user,
    );
    return response.status(200).json({
      success: true,
      message: "Lấy danh sách bản quyền phần mềm thành công.",
      data,
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Lấy thông tin chi tiết một gói bản quyền phần mềm theo ID.
 *
 * @param {import("express").Request} request - HTTP request chứa `params.licenseId`.
 * @param {import("express").Response} response - HTTP response trả về chi tiết bản quyền.
 * @param {import("express").NextFunction} next - Middleware chuyển tiếp lỗi.
 * @returns {Promise<import("express").Response|void>} JSON response HTTP 200.
 */
export async function getSoftwareLicense(request, response, next) {
  try {
    const license = await softwareService.getSoftwareLicense(request.params.licenseId);
    return response.status(200).json({
      success: true,
      message: "Lấy thông tin bản quyền thành công.",
      data: { license },
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Tạo mới một bản quyền phần mềm và phát sự kiện đồng bộ realtime.
 *
 * @param {import("express").Request} request - HTTP request chứa thông tin gói bản quyền trong `body`.
 * @param {import("express").Response} response - HTTP response trả về bản quyền vừa tạo.
 * @param {import("express").NextFunction} next - Middleware chuyển tiếp lỗi.
 * @returns {Promise<import("express").Response|void>} JSON response HTTP 201.
 */
export async function createSoftwareLicense(request, response, next) {
  try {
    const license = await softwareService.createSoftwareLicense(
      request.body,
      request.user,
    );
    // Phát sự kiện realtime để cập nhật danh sách bản quyền và báo cáo FinOps trên client
    publishDataChanged("software");
    return response.status(201).json({
      success: true,
      message: "Thêm bản quyền phần mềm thành công.",
      data: { license },
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Cập nhật thông tin gói bản quyền phần mềm hiện có.
 *
 * @param {import("express").Request} request - HTTP request chứa `params.licenseId` và payload cập nhật.
 * @param {import("express").Response} response - HTTP response trả về bản quyền sau cập nhật.
 * @param {import("express").NextFunction} next - Middleware chuyển tiếp lỗi.
 * @returns {Promise<import("express").Response|void>} JSON response HTTP 200.
 */
export async function updateSoftwareLicense(request, response, next) {
  try {
    const license = await softwareService.updateSoftwareLicense(
      request.params.licenseId,
      request.body,
      request.user,
    );
    publishDataChanged("software");
    return response.status(200).json({
      success: true,
      message: "Cập nhật thông tin bản quyền thành công.",
      data: { license },
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Xóa gói bản quyền phần mềm khỏi hệ thống (yêu cầu không còn nhân viên nào được gán).
 *
 * @param {import("express").Request} request - HTTP request chứa `params.licenseId`.
 * @param {import("express").Response} response - HTTP response xác nhận xóa.
 * @param {import("express").NextFunction} next - Middleware chuyển tiếp lỗi.
 * @returns {Promise<import("express").Response|void>} JSON response HTTP 200.
 */
export async function deleteSoftwareLicense(request, response, next) {
  try {
    await softwareService.deleteSoftwareLicense(request.params.licenseId);
    publishDataChanged("software");
    return response.status(200).json({
      success: true,
      message: "Xóa bản quyền phần mềm thành công.",
      data: null,
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Cấp phát một suất bản quyền phần mềm (`seat`) cho nhân viên đang sử dụng thiết bị công ty.
 *
 * @param {import("express").Request} request - HTTP request chứa `params.licenseId` và `{ userId, note }`.
 * @param {import("express").Response} response - HTTP response trả về thông tin bản quyền sau cấp phát.
 * @param {import("express").NextFunction} next - Middleware chuyển tiếp lỗi.
 * @returns {Promise<import("express").Response|void>} JSON response HTTP 200.
 */
export async function allocateLicense(request, response, next) {
  try {
    const license = await softwareService.allocateLicense(
      request.params.licenseId,
      request.body,
      request.user,
    );
    publishDataChanged("software");
    return response.status(200).json({
      success: true,
      message: `Cấp phát bản quyền ${license.name} cho nhân viên thành công.`,
      data: { license },
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Thu hồi suất bản quyền phần mềm đã cấp phát từ một nhân viên.
 *
 * @param {import("express").Request} request - HTTP request chứa `params.licenseId` và `{ userId }`.
 * @param {import("express").Response} response - HTTP response trả về bản quyền sau thu hồi.
 * @param {import("express").NextFunction} next - Middleware chuyển tiếp lỗi.
 * @returns {Promise<import("express").Response|void>} JSON response HTTP 200.
 */
export async function revokeLicense(request, response, next) {
  try {
    const license = await softwareService.revokeLicense(
      request.params.licenseId,
      request.body,
      request.user,
    );
    publishDataChanged("software");
    return response.status(200).json({
      success: true,
      message: `Thu hồi bản quyền ${license.name} thành công.`,
      data: { license },
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Lấy báo cáo tổng hợp chi phí bản quyền và hiệu suất sử dụng (FinOps) toàn hệ thống.
 *
 * @param {import("express").Request} _request - HTTP request (không sử dụng).
 * @param {import("express").Response} response - HTTP response trả về số liệu FinOps.
 * @param {import("express").NextFunction} next - Middleware chuyển tiếp lỗi.
 * @returns {Promise<import("express").Response|void>} JSON response HTTP 200.
 */
export async function getFinOpsSummary(_request, response, next) {
  try {
    const finOps = await softwareService.getFinOpsSummary();
    return response.status(200).json({
      success: true,
      message: "Lấy báo cáo FinOps & chi phí CNTT thành công.",
      data: { finOps },
    });
  } catch (error) {
    return next(error);
  }
}
