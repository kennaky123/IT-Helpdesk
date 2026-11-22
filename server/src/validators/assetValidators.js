/**
 * @file assetValidators.js
 * @description Bộ middleware kiểm tra và chuẩn hóa dữ liệu đầu vào cho module Quản lý Tài sản IT & Yêu cầu cấp phát.
 * Vai trò trong kiến trúc Backend: Thuộc tầng Validator (Express Middleware Validator), bảo vệ các endpoint
 * trong `assetRoutes.js` bằng cách kiểm tra ObjectId, query filter, thông tin thiết bị, luồng bàn giao/thu hồi
 * và quy trình xử lý yêu cầu cấp phát thiết bị.
 */
import { isValidId } from "../config/database.js";
import {
  ASSET_REQUEST_STATUSES,
  ASSET_STATUSES,
  ASSET_TYPES,
  REMOTE_TOOLS,
} from "../constants/asset.js";
import ApiError from "../utils/ApiError.js";

/**
 * Hàm điều phối lỗi chung: trả về `ApiError(400)` nếu có lỗi hoặc gọi `next()` đi tiếp tới controller.
 */
function reject(errors, next) {
  return errors.length
    ? next(new ApiError(400, "Dữ liệu đầu vào không hợp lệ.", errors))
    : next();
}

/**
 * Hàm chuẩn hóa chuỗi có kiểm tra kiểu dữ liệu và giới hạn độ dài tối đa.
 * Trả về `Symbol.for("invalid")` nếu không phải chuỗi hoặc vượt quá `max` ký tự.
 */
function text(value, max) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return Symbol.for("invalid");
  const trimmed = value.trim();
  if (trimmed.length > max) return Symbol.for("invalid");
  return trimmed || null;
}

/**
 * Kiểm tra giá trị có bị hàm `text()` đánh dấu không hợp lệ hay không.
 */
function isInvalid(value) {
  return value === Symbol.for("invalid");
}

/**
 * Middleware kiểm tra tính hợp lệ của tham số `:assetId` hoặc `:requestId` trong URL.
 */
export function validateAssetId(request, _response, next) {
  const id = request.params.assetId ?? request.params.requestId;
  return isValidId(id)
    ? next()
    : next(new ApiError(400, "Mã định danh không hợp lệ."));
}

/**
 * Middleware validate bộ lọc truy vấn danh sách thiết bị (`GET /api/assets`).
 * Gắn kết quả đã chuẩn hóa vào `request.assetQuery` cho controller sử dụng.
 */
export function validateAssetQuery(request, _response, next) {
  const { status, type, search, assignedTo } = request.query ?? {};
  const errors = [];

  // Kiểm tra các bộ lọc thuộc danh sách enum cho phép, ObjectId hợp lệ và độ dài từ khóa tìm kiếm
  if (status && !ASSET_STATUSES.includes(status)) errors.push("Trạng thái lọc không hợp lệ.");
  if (type && !ASSET_TYPES.includes(type)) errors.push("Loại thiết bị lọc không hợp lệ.");
  if (assignedTo && !isValidId(assignedTo)) {
    errors.push("Người dùng lọc không hợp lệ.");
  }
  if (search && (typeof search !== "string" || search.length > 100)) {
    errors.push("Từ khóa tìm kiếm không hợp lệ.");
  }

  // Lưu query đã làm sạch vào request.assetQuery
  request.assetQuery = {
    status: status || null,
    type: type || null,
    search: typeof search === "string" ? search.trim() : null,
    assignedTo: assignedTo || null,
  };
  return reject(errors, next);
}

/**
 * Factory tạo middleware validate request body khi tạo mới hoặc cập nhật tài sản IT.
 * @param {boolean} isCreate - True nếu là thao tác tạo mới (bắt buộc `assetTag` và `name`), False nếu cập nhật từng phần.
 * @returns {import("express").RequestHandler} Middleware Express.
 */
export function validateAssetBody(isCreate) {
  return (request, _response, next) => {
    const body = request.body ?? {};
    const errors = [];
    const result = {};

    // Bảng cấu hình độ dài tối đa của từng trường văn bản trên Asset
    const fields = {
      assetTag: 40,
      name: 120,
      serialNumber: 80,
      specs: 300,
      os: 80,
      remoteId: 60,
      notes: 500,
    };

    // Duyệt qua các trường văn bản để trim và kiểm tra giới hạn độ dài
    for (const [field, max] of Object.entries(fields)) {
      const value = text(body[field], max);
      if (isInvalid(value)) errors.push(`Trường ${field} không hợp lệ (tối đa ${max} ký tự).`);
      else if (value !== undefined) result[field] = value;
    }

    // Kiểm tra mã Asset Tag (bắt buộc khi tạo mới hoặc khi có gửi lên trong PATCH)
    if (isCreate || "assetTag" in body) {
      if (!result.assetTag || !/^[A-Za-z0-9._-]{2,40}$/.test(result.assetTag)) {
        errors.push("Asset Tag chỉ gồm chữ, số, dấu chấm, gạch ngang (2-40 ký tự).");
      }
    }
    // Kiểm tra tên thiết bị tối thiểu 2 ký tự
    if ((isCreate || "name" in body) && (!result.name || result.name.length < 2)) {
      errors.push("Tên thiết bị phải có ít nhất 2 ký tự.");
    }

    // Kiểm tra các trường enum: type, status, remoteTool
    if (body.type !== undefined) {
      if (!ASSET_TYPES.includes(body.type)) errors.push("Loại thiết bị không hợp lệ.");
      else result.type = body.type;
    }

    if (body.status !== undefined) {
      if (!ASSET_STATUSES.includes(body.status)) errors.push("Trạng thái thiết bị không hợp lệ.");
      else result.status = body.status;
    }

    if (body.remoteTool !== undefined) {
      if (!REMOTE_TOOLS.includes(body.remoteTool)) errors.push("Phần mềm điều khiển từ xa không hợp lệ.");
      else result.remoteTool = body.remoteTool;
    }

    // Kiểm tra định dạng ID điều khiển từ xa (AnyDesk / TeamViewer...) nếu có nhập
    if (result.remoteId && !/^[A-Za-z0-9@._\s-]{3,60}$/.test(result.remoteId)) {
      errors.push("ID AnyDesk / TeamViewer chỉ gồm chữ, số, khoảng trắng, @ . _ -");
    }

    // Kiểm tra và chuyển đổi ngày mua sang đối tượng Date (hoặc null nếu xóa trắng)
    if (body.purchaseDate !== undefined) {
      if (body.purchaseDate === null || body.purchaseDate === "") {
        result.purchaseDate = null;
      } else {
        const date = new Date(body.purchaseDate);
        if (Number.isNaN(date.getTime())) errors.push("Ngày mua không hợp lệ.");
        else result.purchaseDate = date;
      }
    }

    // Gán lại body đã lọc sạch các trường hợp lệ
    request.body = result;
    return reject(errors, next);
  };
}

/**
 * Middleware validate dữ liệu cấp phát thiết bị cho nhân viên (`POST /api/assets/:assetId/assign`).
 * Quy tắc: Bắt buộc `userId` là ObjectId hợp lệ và `note` tối đa 500 ký tự.
 */
export function validateAssignAsset(request, _response, next) {
  const { userId } = request.body ?? {};
  const note = text(request.body?.note, 500);
  const errors = [];

  if (!isValidId(userId)) errors.push("Vui lòng chọn nhân viên nhận thiết bị.");
  if (isInvalid(note)) errors.push("Ghi chú tối đa 500 ký tự.");

  request.body = { userId, note: isInvalid(note) ? null : note ?? null };
  return reject(errors, next);
}

/**
 * Middleware validate dữ liệu thu hồi thiết bị từ nhân viên (`POST /api/assets/:assetId/return`).
 * Quy tắc: Trạng thái sau thu hồi chỉ được là `"in_stock"` (mặc định) hoặc `"maintenance"`.
 */
export function validateReturnAsset(request, _response, next) {
  const status = request.body?.status ?? "in_stock";
  const note = text(request.body?.note, 500);
  const errors = [];

  if (!["in_stock", "maintenance"].includes(status)) {
    errors.push("Thiết bị thu hồi chỉ có thể về Kho hoặc Bảo trì.");
  }
  if (isInvalid(note)) errors.push("Ghi chú tối đa 500 ký tự.");

  request.body = { status, note: isInvalid(note) ? null : note ?? null };
  return reject(errors, next);
}

/**
 * Middleware validate tham số lọc danh sách yêu cầu cấp phát thiết bị (`GET /api/assets/requests`).
 */
export function validateRequestQuery(request, _response, next) {
  const { status } = request.query ?? {};
  if (status && !ASSET_REQUEST_STATUSES.includes(status)) {
    return next(new ApiError(400, "Trạng thái yêu cầu không hợp lệ."));
  }
  request.assetRequestQuery = { status: status || null };
  return next();
}

/**
 * Middleware validate dữ liệu tạo mới yêu cầu cấp phát thiết bị (`POST /api/assets/requests`).
 * Quy tắc: Bắt buộc `employeeId` hợp lệ; `technicianId` (nếu có) phải là ObjectId hợp lệ; `assetType` thuộc ASSET_TYPES.
 */
export function validateCreateAssetRequest(request, _response, next) {
  const body = request.body ?? {};
  const note = text(body.note, 1000);
  const assetType = body.assetType ?? "laptop";
  const errors = [];

  if (!isValidId(body.employeeId)) errors.push("Vui lòng chọn nhân viên cần cấp thiết bị.");
  if (body.technicianId && !isValidId(body.technicianId)) {
    errors.push("Kỹ thuật viên không hợp lệ.");
  }
  if (!ASSET_TYPES.includes(assetType)) errors.push("Loại thiết bị không hợp lệ.");
  if (isInvalid(note)) errors.push("Ghi chú tối đa 1000 ký tự.");

  request.body = {
    employeeId: body.employeeId,
    technicianId: body.technicianId || null,
    assetType,
    note: isInvalid(note) ? null : note ?? null,
  };
  return reject(errors, next);
}

/**
 * Middleware validate dữ liệu hoàn tất bàn giao thiết bị theo yêu cầu (`POST /api/assets/requests/:requestId/complete`).
 * Quy tắc: Bắt buộc `assetId` của thiết bị cụ thể trong kho để bàn giao.
 */
export function validateCompleteAssetRequest(request, _response, next) {
  const { assetId } = request.body ?? {};
  const note = text(request.body?.note, 500);
  const errors = [];

  if (!isValidId(assetId)) errors.push("Vui lòng chọn thiết bị trong kho để bàn giao.");
  if (isInvalid(note)) errors.push("Ghi chú tối đa 500 ký tự.");

  request.body = { assetId, note: isInvalid(note) ? null : note ?? null };
  return reject(errors, next);
}

/**
 * Middleware validate lý do hủy yêu cầu cấp phát thiết bị (`POST /api/assets/requests/:requestId/cancel`).
 */
export function validateCancelAssetRequest(request, _response, next) {
  const reason = text(request.body?.reason, 500);
  if (isInvalid(reason)) return next(new ApiError(400, "Lý do hủy tối đa 500 ký tự."));
  request.body = { reason: reason ?? null };
  return next();
}
