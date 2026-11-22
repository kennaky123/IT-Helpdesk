/**
 * @file softwareValidators.js
 * @description Bộ middleware kiểm tra và chuẩn hóa dữ liệu đầu vào cho module Quản lý Bản quyền Phần mềm (Software Licenses).
 * Vai trò trong kiến trúc Backend: Thuộc tầng Validator (Express Middleware Validator), dùng trong `softwareRoutes.js`
 * để xác thực `:licenseId`, tham số lọc danh sách, thông tin gói bản quyền/chi phí và thao tác cấp phát/thu hồi seat.
 */
import { isValidId } from "../config/database.js";
import {
  BILLING_CYCLES,
  LICENSE_STATUSES,
  LICENSE_TYPES,
  SOFTWARE_CATEGORIES,
} from "../constants/software.js";
import ApiError from "../utils/ApiError.js";

/**
 * Hàm điều phối kết quả kiểm tra: chuyển tiếp `ApiError(400)` nếu phát hiện lỗi hoặc gọi `next()`.
 */
function reject(errors, next) {
  return errors.length
    ? next(new ApiError(400, "Dữ liệu bản quyền không hợp lệ.", errors))
    : next();
}

/**
 * Hàm chuẩn hóa chuỗi có kiểm tra kiểu `string` và độ dài tối đa `max`.
 * Trả về `Symbol.for("invalid")` nếu giá trị sai kiểu hoặc vượt độ dài cho phép.
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
 * Kiểm tra một giá trị có phải là cờ đánh dấu lỗi từ hàm `text()` hay không.
 */
function isInvalid(value) {
  return value === Symbol.for("invalid");
}

/**
 * Middleware xác thực tham số `:licenseId` trên URL là MongoDB ObjectId hợp lệ.
 */
export function validateSoftwareId(request, _response, next) {
  const id = request.params.licenseId;
  return isValidId(id)
    ? next()
    : next(new ApiError(400, "Mã định danh bản quyền không hợp lệ."));
}

/**
 * Middleware validate các tham số lọc danh sách phần mềm (`GET /api/software`).
 * Gắn bộ lọc sạch vào `request.softwareQuery` gồm `category`, `type`, `status`, `search`.
 */
export function validateSoftwareQuery(request, _response, next) {
  const { category, type, status, search } = request.query ?? {};
  const errors = [];

  if (category && !SOFTWARE_CATEGORIES.includes(category)) {
    errors.push("Danh mục lọc không hợp lệ.");
  }
  if (type && !LICENSE_TYPES.includes(type)) {
    errors.push("Loại bản quyền lọc không hợp lệ.");
  }
  if (status && !LICENSE_STATUSES.includes(status)) {
    errors.push("Trạng thái lọc không hợp lệ.");
  }
  if (search && (typeof search !== "string" || search.length > 100)) {
    errors.push("Từ khóa tìm kiếm không hợp lệ.");
  }

  request.softwareQuery = {
    category: category || null,
    type: type || null,
    status: status || null,
    search: typeof search === "string" ? search.trim() : null,
  };
  return reject(errors, next);
}

/**
 * Factory tạo middleware validate body khi tạo mới hoặc cập nhật bản quyền phần mềm.
 * @param {boolean} isCreate - True nếu tạo mới (bắt buộc `name`, `vendor`, `totalSeats`), False nếu cập nhật từng phần.
 * @returns {import("express").RequestHandler} Middleware Express.
 */
export function validateSoftwareBody(isCreate) {
  return (request, _response, next) => {
    const body = request.body ?? {};
    const errors = [];
    const result = {};

    // Cấu hình giới hạn ký tự cho từng trường văn bản
    const fields = {
      name: 150,
      vendor: 100,
      licenseKey: 300,
      portalUrl: 255,
      notes: 1000,
      currency: 10,
    };

    for (const [field, max] of Object.entries(fields)) {
      const val = text(body[field], max);
      if (isInvalid(val)) errors.push(`Trường ${field} không hợp lệ (tối đa ${max} ký tự).`);
      else if (val !== undefined) result[field] = val;
    }

    // Chuẩn hóa mã tiền tệ sang chữ hoa (ví dụ: VND, USD)
    if (result.currency) {
      result.currency = result.currency.toUpperCase();
    }

    // Kiểm tra tên phần mềm và tên hãng cung cấp tối thiểu 2 ký tự
    if ((isCreate || "name" in body) && (!result.name || result.name.length < 2)) {
      errors.push("Tên phần mềm phải có ít nhất 2 ký tự.");
    }
    if ((isCreate || "vendor" in body) && (!result.vendor || result.vendor.length < 2)) {
      errors.push("Tên hãng/nhà cung cấp phải có ít nhất 2 ký tự.");
    }

    // Kiểm tra các trường enum: category, type, billingCycle
    if (body.category !== undefined) {
      if (!SOFTWARE_CATEGORIES.includes(body.category)) {
        errors.push("Danh mục phần mềm không hợp lệ.");
      } else {
        result.category = body.category;
      }
    }

    if (body.type !== undefined) {
      if (!LICENSE_TYPES.includes(body.type)) {
        errors.push("Loại bản quyền không hợp lệ.");
      } else {
        result.type = body.type;
      }
    }

    if (body.billingCycle !== undefined) {
      if (!BILLING_CYCLES.includes(body.billingCycle)) {
        errors.push("Chu kỳ thanh toán không hợp lệ.");
      } else {
        result.billingCycle = body.billingCycle;
      }
    }

    // Kiểm tra tổng số bản quyền (Seats) phải là số nguyên >= 1
    if (isCreate || "totalSeats" in body) {
      const seats = Number(body.totalSeats);
      if (!Number.isInteger(seats) || seats < 1) {
        errors.push("Tổng số bản quyền (Seats) phải là số nguyên dương >= 1.");
      } else {
        result.totalSeats = seats;
      }
    }

    // Kiểm tra chi phí mỗi seat là số không âm
    if (body.costPerSeat !== undefined) {
      const cost = Number(body.costPerSeat);
      if (Number.isNaN(cost) || cost < 0) {
        errors.push("Chi phí mỗi bản quyền không hợp lệ.");
      } else {
        result.costPerSeat = cost;
      }
    }

    // Chuyển đổi ngày mua bản quyền (mặc định ngày hiện tại nếu truyền giá trị rỗng)
    if (body.purchaseDate !== undefined) {
      if (!body.purchaseDate) {
        result.purchaseDate = new Date();
      } else {
        const d = new Date(body.purchaseDate);
        if (Number.isNaN(d.getTime())) errors.push("Ngày bắt đầu mua không hợp lệ.");
        else result.purchaseDate = d;
      }
    }

    // Chuyển đổi ngày hết hạn (cho phép null với bản quyền vĩnh viễn)
    if (body.expiryDate !== undefined) {
      if (!body.expiryDate) {
        result.expiryDate = null;
      } else {
        const d = new Date(body.expiryDate);
        if (Number.isNaN(d.getTime())) errors.push("Ngày hết hạn không hợp lệ.");
        else result.expiryDate = d;
      }
    }

    // Ghi đè request.body bằng đối tượng sạch đã được xác thực
    request.body = result;
    return reject(errors, next);
  };
}

/**
 * Middleware validate dữ liệu cấp phát một seat bản quyền cho nhân viên (`POST /:licenseId/allocate`).
 * Quy tắc: Bắt buộc `userId` hợp lệ và `note` tối đa 300 ký tự.
 */
export function validateAllocateLicense(request, _response, next) {
  const { userId } = request.body ?? {};
  const note = text(request.body?.note, 300);
  const errors = [];

  if (!isValidId(userId)) {
    errors.push("Vui lòng chọn nhân viên để cấp bản quyền.");
  }
  if (isInvalid(note)) {
    errors.push("Ghi chú tối đa 300 ký tự.");
  }

  request.body = { userId, note: isInvalid(note) ? null : note ?? null };
  return reject(errors, next);
}

/**
 * Middleware validate dữ liệu thu hồi seat bản quyền từ nhân viên (`POST /:licenseId/revoke`).
 * Quy tắc: Bắt buộc `userId` là MongoDB ObjectId hợp lệ.
 */
export function validateRevokeLicense(request, _response, next) {
  const { userId } = request.body ?? {};
  if (!isValidId(userId)) {
    return next(new ApiError(400, "Vui lòng chọn nhân viên cần thu hồi bản quyền."));
  }
  request.body = { userId };
  return next();
}
