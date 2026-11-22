/**
 * @file ticketValidators.js
 * @description Bộ middleware kiểm tra và chuẩn hóa toàn bộ dữ liệu đầu vào cho quy trình xử lý Ticket.
 * Vai trò trong kiến trúc Backend: Thuộc tầng Validator (Express Middleware Validator), dùng trong `ticketRoutes.js`
 * và `ticketConversationRoutes.js` để xác thực ObjectId, tạo ticket, bộ lọc danh sách phức tạp, phân công kỹ thuật viên,
 * chuyển trạng thái, cập nhật giải pháp, hủy và đóng ticket.
 */
import { isValidId } from "../config/database.js";
import {
  TICKET_PRIORITIES,
  TICKET_STATUSES,
} from "../constants/ticket.js";
import ApiError from "../utils/ApiError.js";

// Các trạng thái đích mà Technician được phép cập nhật trực tiếp qua endpoint /status
const technicianTargetStatuses = [
  "in_progress",
  "waiting_user",
  "resolved",
];

// Giới hạn số trang tối đa cho truy vấn phân trang
const MAX_PAGE = 1_000_000;

/**
 * Hàm điều phối lỗi chuẩn: đẩy `ApiError(400)` nếu có lỗi hoặc gọi `next()` để tiếp tục pipeline.
 */
function rejectInvalidInput(errors, next) {
  if (errors.length > 0) {
    return next(
      new ApiError(400, "Dữ liệu đầu vào không hợp lệ.", errors),
    );
  }

  return next();
}

/**
 * Chuẩn hóa chuỗi tùy chọn: trim khoảng trắng, trả về null nếu rỗng hoặc không phải chuỗi.
 */
function normalizeOptionalString(value) {
  return typeof value === "string" ? value.trim() || null : null;
}

/**
 * Chuẩn hóa tham số chuỗi trên query string; đẩy thông báo lỗi vào mảng `errors` nếu sai kiểu dữ liệu.
 */
function normalizeQueryString(value, fieldName, errors) {
  if (value === undefined) {
    return null;
  }

  if (typeof value !== "string") {
    errors.push(`${fieldName} phải là chuỗi.`);
    return null;
  }

  return value.trim() || null;
}

/**
 * Chuẩn hóa chuỗi tùy chọn trong request body; kiểm tra đúng kiểu `string` nếu được truyền vào.
 */
function normalizeBodyOptionalString(value, fieldName, errors) {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "string") {
    errors.push(`${fieldName} phải là chuỗi.`);
    return null;
  }

  return value.trim() || null;
}

/**
 * Phân tích tham số phân trang thành số nguyên không âm an toàn, trả về `fallback` nếu không truyền.
 */
function parsePositiveInteger(value, fallback) {
  if (value === undefined) {
    return fallback;
  }

  if (typeof value !== "string" && typeof value !== "number") {
    return Number.NaN;
  }

  const normalizedValue = String(value);

  if (!/^\d+$/.test(normalizedValue)) {
    return Number.NaN;
  }

  const parsedValue = Number.parseInt(normalizedValue, 10);
  return Number.isSafeInteger(parsedValue) ? parsedValue : Number.NaN;
}

/**
 * Middleware kiểm tra tính hợp lệ của tham số `:ticketId` trên URL.
 */
export function validateTicketId(request, _response, next) {
  const { ticketId } = request.params;

  if (!isValidId(ticketId)) {
    return next(new ApiError(400, "ID ticket không hợp lệ."));
  }

  return next();
}

/**
 * Middleware kiểm tra tính hợp lệ của tham số `:attachmentId` trên URL khi tải tệp đính kèm.
 */
export function validateAttachmentId(request, _response, next) {
  const { attachmentId } = request.params;

  if (!isValidId(attachmentId)) {
    return next(new ApiError(400, "ID tệp đính kèm không hợp lệ."));
  }

  return next();
}

/**
 * Middleware validate dữ liệu tạo mới Ticket (`POST /api/tickets`).
 * Quy tắc: `title` (5-200 ký tự), `description` (10-5000 ký tự), `category` là ObjectId hợp lệ,
 * `priority` thuộc `TICKET_PRIORITIES` (mặc định `"medium"`), `technicianId` (nếu có) phải là ObjectId hợp lệ.
 */
export function validateCreateTicket(request, _response, next) {
  try {
    const body = request.body ?? {};
    const errors = [];
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const description =
      typeof body.description === "string" ? body.description.trim() : "";
    const priority = body.priority ?? "medium";

    if (title.length < 5 || title.length > 200) {
      errors.push("Tiêu đề phải có từ 5 đến 200 ký tự.");
    }

    if (description.length < 10 || description.length > 5000) {
      errors.push("Mô tả phải có từ 10 đến 5000 ký tự.");
    }

    if (!isValidId(body.category)) {
      errors.push("Danh mục không hợp lệ.");
    }

    if (!TICKET_PRIORITIES.includes(priority)) {
      errors.push("Mức độ ưu tiên không hợp lệ.");
    }

    // Cho phép chỉ định sẵn kỹ thuật viên tùy chọn khi tạo ticket
    const technicianId =
      typeof body.technicianId === "string" && body.technicianId.trim()
        ? body.technicianId.trim()
        : null;

    if (technicianId && !isValidId(technicianId)) {
      errors.push("Kỹ thuật viên được phân công không hợp lệ.");
    }

    // Làm sạch request.body chỉ giữ lại đúng các trường được phép
    request.body = {
      title,
      description,
      category: body.category,
      priority,
      technicianId: technicianId || undefined,
    };

    return rejectInvalidInput(errors, next);
  } catch (error) {
    return next(error);
  }
}

/**
 * Middleware validate và chuẩn hóa bộ lọc + phân trang danh sách Ticket (`GET /api/tickets`).
 * Hỗ trợ tìm kiếm từ khóa, lọc đơn `status` hoặc đa trạng thái `statuses` (không dùng đồng thời cả 2),
 * lọc theo `priority`, `category`, `technician`, `page`, `limit` và `sortOrder`.
 * Gắn đối tượng sạch vào `request.ticketQuery`.
 */
export function validateTicketQuery(request, _response, next) {
  try {
    const query = request.query ?? {};
    const errors = [];
    const search = normalizeQueryString(query.search, "Từ khóa tìm kiếm", errors);
    const status = normalizeQueryString(query.status, "Trạng thái", errors);
    const statusesValue = normalizeQueryString(
      query.statuses,
      "Danh sách trạng thái",
      errors,
    );
    const priority = normalizeQueryString(query.priority, "Mức độ ưu tiên", errors);
    const category = normalizeQueryString(query.category, "Danh mục", errors);
    const technician = normalizeQueryString(
      query.technician,
      "Technician",
      errors,
    );
    const sortOrder =
      normalizeQueryString(query.sortOrder, "Thứ tự sắp xếp", errors) ||
      "desc";
    const page = parsePositiveInteger(query.page, 1);
    const limit = parsePositiveInteger(query.limit, 10);

    if (search && search.length > 100) {
      errors.push("Từ khóa tìm kiếm không được vượt quá 100 ký tự.");
    }

    if (status && !TICKET_STATUSES.includes(status)) {
      errors.push("Bộ lọc trạng thái không hợp lệ.");
    }

    // Tách chuỗi statuses phân cách bằng dấu phẩy và khử trùng lặp bằng Set
    const statuses = statusesValue
      ? [...new Set(statusesValue.split(",").map((item) => item.trim()).filter(Boolean))]
      : [];

    if (
      statuses.length > TICKET_STATUSES.length ||
      statuses.some((item) => !TICKET_STATUSES.includes(item))
    ) {
      errors.push("Danh sách trạng thái lọc không hợp lệ.");
    }

    // Ngăn xung đột logic khi client gửi cả bộ lọc đơn (status) và bộ lọc nhiều trạng thái (statuses)
    if (status && statuses.length > 0) {
      errors.push("Chỉ được dùng một kiểu bộ lọc trạng thái.");
    }

    if (priority && !TICKET_PRIORITIES.includes(priority)) {
      errors.push("Bộ lọc mức độ ưu tiên không hợp lệ.");
    }

    if (category && !isValidId(category)) {
      errors.push("Bộ lọc danh mục không hợp lệ.");
    }

    if (technician && !isValidId(technician)) {
      errors.push("Bộ lọc Technician không hợp lệ.");
    }

    if (!Number.isSafeInteger(page) || page < 1 || page > MAX_PAGE) {
      errors.push(`Trang phải là số nguyên từ 1 đến ${MAX_PAGE}.`);
    }

    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      errors.push("Số bản ghi mỗi trang phải nằm trong khoảng 1 đến 100.");
    }

    if (!["asc", "desc"].includes(sortOrder)) {
      errors.push("Thứ tự sắp xếp phải là asc hoặc desc.");
    }

    // Lưu toàn bộ tham số lọc sạch vào request.ticketQuery để controller xây dựng query MongoDB
    request.ticketQuery = {
      search,
      status,
      statuses,
      priority,
      category,
      technician,
      page,
      limit,
      sortOrder,
    };

    return rejectInvalidInput(errors, next);
  } catch (error) {
    return next(error);
  }
}

/**
 * Middleware validate payload phân công hoặc chuyển giao kỹ thuật viên (`PATCH /api/tickets/:ticketId/assign`).
 * Quy tắc: Bắt buộc `technicianId` là ObjectId hợp lệ; `reason` tùy chọn tối đa 500 ký tự.
 */
export function validateAssignment(request, _response, next) {
  try {
    const body = request.body ?? {};
    const errors = [];
    const reason = normalizeBodyOptionalString(
      body.reason,
      "Lý do phân công",
      errors,
    );

    if (!isValidId(body.technicianId)) {
      errors.push("ID Technician không hợp lệ.");
    }

    if (reason && reason.length > 500) {
      errors.push("Lý do phân công không được vượt quá 500 ký tự.");
    }

    request.body = {
      technicianId: body.technicianId,
      reason,
    };

    return rejectInvalidInput(errors, next);
  } catch (error) {
    return next(error);
  }
}

/**
 * Middleware validate dữ liệu cập nhật trạng thái xử lý ticket (`PATCH /api/tickets/:ticketId/status`).
 * Quy tắc: `status` thuộc `["in_progress", "waiting_user", "resolved"]`, bắt buộc `note` (1-500 ký tự);
 * chỉ cho phép gửi `resolution` (<= 5000 ký tự) khi chuyển sang trạng thái `"resolved"`.
 */
export function validateStatusUpdate(request, _response, next) {
  try {
    const body = request.body ?? {};
    const errors = [];
    const status = normalizeOptionalString(body.status);
    const note = normalizeBodyOptionalString(body.note, "Ghi chú", errors);
    const resolution = normalizeBodyOptionalString(
      body.resolution,
      "Nội dung giải quyết",
      errors,
    );

    if (!technicianTargetStatuses.includes(status)) {
      errors.push("Trạng thái cập nhật của Technician không hợp lệ.");
    }

    if (!note || note.length > 500) {
      errors.push("Ghi chú trạng thái phải có từ 1 đến 500 ký tự.");
    }

    if (resolution && resolution.length > 5000) {
      errors.push("Nội dung giải quyết không được vượt quá 5000 ký tự.");
    }

    if (resolution && status !== "resolved") {
      errors.push(
        "Chỉ gửi nội dung giải quyết khi chuyển ticket sang resolved.",
      );
    }

    request.body = { status, note, resolution };
    return rejectInvalidInput(errors, next);
  } catch (error) {
    return next(error);
  }
}

/**
 * Middleware validate cập nhật nội dung giải quyết ticket (`PATCH /api/tickets/:ticketId/resolution`).
 * Quy tắc: Bắt buộc `resolution` từ 1 đến 5000 ký tự.
 */
export function validateResolution(request, _response, next) {
  try {
    const errors = [];
    const resolution = normalizeBodyOptionalString(
      request.body?.resolution,
      "Nội dung giải quyết",
      errors,
    );

    if (!resolution || resolution.length > 5000) {
      errors.push("Nội dung giải quyết phải có từ 1 đến 5000 ký tự.");
    }

    request.body = { resolution };
    return rejectInvalidInput(errors, next);
  } catch (error) {
    return next(error);
  }
}

/**
 * Middleware validate dữ liệu hủy ticket (`PATCH /api/tickets/:ticketId/cancel`).
 * Quy tắc: `reason` tùy chọn, nếu có thì tối đa 500 ký tự.
 */
export function validateCancellation(request, _response, next) {
  try {
    const errors = [];
    const reason = normalizeBodyOptionalString(
      request.body?.reason,
      "Lý do hủy",
      errors,
    );

    if (reason && reason.length > 500) {
      errors.push("Lý do hủy không được vượt quá 500 ký tự.");
    }

    request.body = { reason };
    return rejectInvalidInput(errors, next);
  } catch (error) {
    return next(error);
  }
}

/**
 * Middleware validate dữ liệu đóng ticket (`PATCH /api/tickets/:ticketId/close`).
 * Quy tắc: `note` ghi chú đóng ticket tùy chọn tối đa 500 ký tự.
 */
export function validateCloseTicket(request, _response, next) {
  try {
    const errors = [];
    const note = normalizeBodyOptionalString(
      request.body?.note,
      "Ghi chú đóng ticket",
      errors,
    );

    if (note && note.length > 500) {
      errors.push("Ghi chú đóng ticket không được vượt quá 500 ký tự.");
    }

    request.body = { note };
    return rejectInvalidInput(errors, next);
  } catch (error) {
    return next(error);
  }
}
