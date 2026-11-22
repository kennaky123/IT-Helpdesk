/**
 * @file usbController.js
 * @description Controller giám sát bảo mật thiết bị USB và giao tiếp với USB Agent trên máy trạm.
 * Vai trò Controller: Tiếp nhận HTTP request từ cả Windows USB Agent (ping, báo cáo sự kiện
 * cắm/rút USB, đồng bộ chính sách whitelist/blacklist, tải tệp thực thi Agent) lẫn giao diện
 * quản trị (dashboard USB, thông tin mạng LAN, cập nhật chính sách, xóa thiết bị), đồng thời
 * đẩy cảnh báo thời gian thực qua SSE và trả về JSON/file response.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { publishDataChanged } from "../services/realtimeService.js";
import {
  deleteUsbDevice,
  getServerNetworkInfo,
  listAgentUsbPolicies,
  listUsbDashboardData,
  recordAgentUsbEvent,
  updateUsbDevicePolicy,
} from "../services/usbService.js";
import ApiError from "../utils/ApiError.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Tiếp nhận tín hiệu kiểm tra kết nối (ping) từ USB Agent và trả về thông tin mạng LAN máy chủ.
 *
 * @param {import("express").Request} _request - HTTP request từ Agent.
 * @param {import("express").Response} response - HTTP response xác nhận server trực tuyến.
 * @param {import("express").NextFunction} next - Middleware chuyển tiếp lỗi.
 * @returns {Promise<import("express").Response|void>} JSON response HTTP 200.
 */
export async function handleAgentPing(_request, response, next) {
  try {
    const networkInfo = getServerNetworkInfo();
    return response.status(200).json({
      success: true,
      message: "IT Helpdesk USB Security Server đang hoạt động.",
      data: {
        online: true,
        serverTime: new Date().toISOString(),
        networkInfo,
      },
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Tiếp nhận sự kiện cắm/rút thiết bị USB do Agent gửi lên, lưu nhật ký, đối chiếu chính sách
 * whitelist/blacklist và phát cảnh báo realtime tới bảng điều khiển Admin & Kỹ thuật viên.
 *
 * @param {import("express").Request} request - HTTP request chứa `usbAgentEvent` và địa chỉ `ip` nguồn.
 * @param {import("express").Response} response - HTTP response trả về trạng thái chính sách thiết bị cho Agent.
 * @param {import("express").NextFunction} next - Middleware chuyển tiếp lỗi.
 * @returns {Promise<import("express").Response|void>} JSON response HTTP 201 kèm `policyStatus` và `policyMessage`.
 */
export async function handleAgentUsbEvent(request, response, next) {
  try {
    // Ghi nhận/cập nhật thiết bị USB và nhật ký sự kiện vào DB thông qua service
    const result = await recordAgentUsbEvent(request.usbAgentEvent, request.ip);

    // Đẩy cảnh báo sự kiện USB realtime qua kênh SSE tới trình duyệt Admin/Technician
    publishDataChanged("usb", {
      usbAlert: {
        eventType: result.eventLog.eventType,
        deviceName: result.device.deviceName,
        vendor: result.device.vendor,
        deviceId: result.device.deviceId,
        driveLetter: result.device.driveLetter,
        hostname: result.eventLog.hostname,
        osUsername: result.eventLog.osUsername,
        ipAddress: result.eventLog.ipAddress,
        status: result.device.status,
        isNewDevice: result.isNewDevice,
        alertLevel: result.alertLevel,
        occurredAt: result.eventLog.createdAt,
      },
    });

    // Ánh xạ thông báo phản hồi dựa theo trạng thái chính sách của thiết bị USB
    let policyMessage =
      "Thiết bị USB chưa được xác minh. Đã gửi cảnh báo tới Admin & Kỹ thuật viên.";
    if (result.device.status === "trusted") {
      policyMessage = "Thiết bị USB nằm trong danh sách hợp lệ (Whitelisted).";
    } else if (result.device.status === "blocked") {
      policyMessage =
        "CẢNH BÁO: Thiết bị USB này bị cấm sử dụng (Blacklisted) bởi Quản trị viên!";
    }

    return response.status(201).json({
      success: true,
      message: policyMessage,
      data: {
        ...result,
        policyStatus: result.device.status,
        policyMessage,
      },
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Cung cấp danh sách chính sách USB (`trusted`/`blocked`/`unverified`) để Agent đồng bộ cục bộ.
 *
 * @param {import("express").Request} _request - HTTP request từ Agent.
 * @param {import("express").Response} response - HTTP response trả về danh sách chính sách thiết bị.
 * @param {import("express").NextFunction} next - Middleware chuyển tiếp lỗi.
 * @returns {Promise<import("express").Response|void>} JSON response HTTP 200.
 */
export async function handleAgentGetPolicies(_request, response, next) {
  try {
    const policies = await listAgentUsbPolicies();
    return response.status(200).json({
      success: true,
      message: "Lấy danh sách chính sách bảo mật USB thành công.",
      data: { policies },
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Cho phép tải xuống tệp thực thi Windows USB Agent (`ITHelpdeskUSBAgent.exe`) từ máy chủ.
 *
 * @param {import("express").Request} _request - HTTP request tải bộ cài Agent.
 * @param {import("express").Response} response - HTTP response truyền tệp `.exe` về trình duyệt.
 * @param {import("express").NextFunction} next - Middleware chuyển tiếp lỗi.
 * @returns {Promise<void>} Gửi tệp tải về hoặc ném lỗi 404 nếu chưa đóng gói.
 */
export async function handleDownloadAgent(_request, response, next) {
  try {
    // Xác định đường dẫn tuyệt đối tới tệp thực thi Agent đã đóng gói trên server
    const exePath = path.resolve(
      __dirname,
      "../../../usb-agent/ITHelpdeskUSBAgent.exe",
    );
    if (!fs.existsSync(exePath)) {
      throw new ApiError(
        404,
        "File ITHelpdeskUSBAgent.exe chưa được đóng gói trên máy chủ.",
      );
    }

    return response.download(exePath, "ITHelpdeskUSBAgent.exe");
  } catch (error) {
    return next(error);
  }
}

/**
 * Lấy dữ liệu giám sát thiết bị USB, lịch sử kết nối và thống kê tổng quan cho giao diện quản trị.
 *
 * @param {import("express").Request} request - HTTP request chứa bộ lọc `usbQuery`.
 * @param {import("express").Response} response - HTTP response trả về dữ liệu dashboard USB.
 * @param {import("express").NextFunction} next - Middleware chuyển tiếp lỗi.
 * @returns {Promise<import("express").Response|void>} JSON response HTTP 200.
 */
export async function handleGetUsbDashboard(request, response, next) {
  try {
    const data = await listUsbDashboardData(request.usbQuery);
    return response.status(200).json({
      success: true,
      message: "Lấy dữ liệu giám sát thiết bị USB thành công.",
      data,
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Lấy thông tin địa chỉ IP LAN và URL kết nối của máy chủ để hướng dẫn cấu hình USB Agent.
 *
 * @param {import("express").Request} _request - HTTP request (không sử dụng).
 * @param {import("express").Response} response - HTTP response trả về thông tin mạng LAN máy chủ.
 * @param {import("express").NextFunction} next - Middleware chuyển tiếp lỗi.
 * @returns {Promise<import("express").Response|void>} JSON response HTTP 200.
 */
export async function handleGetNetworkInfo(_request, response, next) {
  try {
    const networkInfo = getServerNetworkInfo();
    return response.status(200).json({
      success: true,
      message: "Lấy thông tin mạng LAN máy chủ thành công.",
      data: { networkInfo },
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Cập nhật trạng thái chính sách (Whitelist/Blacklist/Unverified), người sở hữu hoặc ghi chú của thiết bị USB.
 *
 * @param {import("express").Request} request - HTTP request chứa `params.usbId`, `usbPolicyPayload` và `user`.
 * @param {import("express").Response} response - HTTP response trả về thiết bị USB sau cập nhật.
 * @param {import("express").NextFunction} next - Middleware chuyển tiếp lỗi.
 * @returns {Promise<import("express").Response|void>} JSON response HTTP 200.
 */
export async function handleUpdateUsbPolicy(request, response, next) {
  try {
    const device = await updateUsbDevicePolicy(
      request.params.usbId,
      request.usbPolicyPayload,
      request.user._id,
    );
    publishDataChanged("usb");
    return response.status(200).json({
      success: true,
      message: "Cập nhật chính sách bảo mật thiết bị USB thành công.",
      data: { device },
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Xóa bản ghi thiết bị USB cùng toàn bộ nhật ký sự kiện liên quan.
 *
 * @param {import("express").Request} request - HTTP request chứa `params.usbId`.
 * @param {import("express").Response} response - HTTP response xác nhận xóa.
 * @param {import("express").NextFunction} next - Middleware chuyển tiếp lỗi.
 * @returns {Promise<import("express").Response|void>} JSON response HTTP 200.
 */
export async function handleDeleteUsbDevice(request, response, next) {
  try {
    await deleteUsbDevice(request.params.usbId);
    publishDataChanged("usb");
    return response.status(200).json({
      success: true,
      message: "Đã xóa thiết bị USB và lịch sử sự kiện liên quan.",
      data: null,
    });
  } catch (error) {
    return next(error);
  }
}
