/**
 * @file usbValidators.js
 * @description Bộ middleware kiểm tra và chuẩn hóa dữ liệu đầu vào cho module Bảo mật & Giám sát USB.
 * Vai trò trong kiến trúc Backend: Thuộc tầng Validator (Express Middleware Validator), dùng trong `usbRoutes.js`
 * để xác thực `:usbId`, bộ lọc dashboard USB, gói tin sự kiện cắm/rút USB từ Windows Agent và payload cập nhật chính sách.
 */
import { isValidId } from "../config/database.js";
import {
  USB_DEVICE_STATUSES,
  USB_DEVICE_TYPES,
  USB_EVENT_TYPES,
} from "../constants/usb.js";
import ApiError from "../utils/ApiError.js";

/**
 * Hàm điều phối kết quả kiểm tra: chuyển `ApiError(400)` sang error handler nếu có lỗi hoặc gọi `next()`.
 */
function reject(errors, next) {
  return errors.length
    ? next(new ApiError(400, "Dữ liệu thiết bị USB không hợp lệ.", errors))
    : next();
}

/**
 * Hàm chuẩn hóa chuỗi có kiểm tra kiểu `string` và giới hạn độ dài `max`.
 * Trả về `Symbol.for("invalid")` nếu sai kiểu hoặc vượt độ dài tối đa.
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
 * Kiểm tra giá trị có mang cờ đánh dấu không hợp lệ từ hàm `text()` hay không.
 */
function isInvalid(value) {
  return value === Symbol.for("invalid");
}

/**
 * Middleware kiểm tra tham số `:usbId` trên URL là MongoDB ObjectId hợp lệ.
 */
export function validateUsbId(request, _response, next) {
  const id = request.params.usbId;
  return isValidId(id)
    ? next()
    : next(new ApiError(400, "Mã định danh thiết bị USB không hợp lệ."));
}

/**
 * Middleware validate tham số lọc trên trang Dashboard USB (`GET /api/usb`).
 * Kiểm tra trạng thái chính sách, loại thiết bị, loại sự kiện, trạng thái kết nối và từ khóa tìm kiếm.
 * Gắn bộ lọc đã chuẩn hóa vào `request.usbQuery`.
 */
export function validateUsbQuery(request, _response, next) {
  const { status, deviceType, eventType, connectionState, search } = request.query ?? {};
  const errors = [];

  if (status && !USB_DEVICE_STATUSES.includes(status)) {
    errors.push("Trạng thái bảo mật lọc không hợp lệ.");
  }
  if (deviceType && !USB_DEVICE_TYPES.includes(deviceType)) {
    errors.push("Loại thiết bị lọc không hợp lệ.");
  }
  if (eventType && !USB_EVENT_TYPES.includes(eventType)) {
    errors.push("Loại sự kiện lọc không hợp lệ.");
  }
  if (connectionState && !["connected", "disconnected"].includes(connectionState)) {
    errors.push("Trạng thái kết nối lọc không hợp lệ.");
  }
  if (search && (typeof search !== "string" || search.length > 100)) {
    errors.push("Từ khóa tìm kiếm không hợp lệ.");
  }

  request.usbQuery = {
    status: status || null,
    deviceType: deviceType || null,
    eventType: eventType || null,
    connectionState: connectionState || null,
    search: typeof search === "string" ? search.trim() : null,
  };

  return reject(errors, next);
}

/**
 * Middleware validate sự kiện USB do Windows Agent gửi lên (`POST /api/usb/agent-event`).
 * Quy tắc: Bắt buộc `deviceId` (3-200 ký tự), `deviceName` (2-200 ký tự), `hostname` (>= 1 ký tự),
 * `eventType` ("connected"|"disconnected"), `deviceType` hợp lệ; chuẩn hóa dữ liệu vào `request.usbAgentEvent`.
 */
export function validateAgentUsbEvent(request, _response, next) {
  const body = request.body ?? {};
  const errors = [];

  // Trích xuất và kiểm tra giới hạn độ dài từng trường từ gói tin của Agent
  const deviceId = text(body.deviceId, 200);
  const deviceName = text(body.deviceName, 200);
  const vendor = text(body.vendor, 120);
  const serialNumber = text(body.serialNumber, 120);
  const driveLetter = text(body.driveLetter, 20);
  const volumeName = text(body.volumeName, 120);
  const hostname = text(body.hostname, 120);
  const osUsername = text(body.osUsername, 120);
  const ipAddress = text(body.ipAddress, 80);
  const agentVersion = text(body.agentVersion, 40);

  // Kiểm tra các trường định danh bắt buộc của thiết bị và máy trạm
  if (!deviceId || isInvalid(deviceId) || deviceId.length < 3) {
    errors.push("deviceId bắt buộc và tối đa 200 ký tự.");
  }
  if (!deviceName || isInvalid(deviceName) || deviceName.length < 2) {
    errors.push("deviceName bắt buộc và tối đa 200 ký tự.");
  }
  if (!hostname || isInvalid(hostname) || hostname.length < 1) {
    errors.push("hostname của máy trạm là bắt buộc.");
  }
  if (isInvalid(vendor)) errors.push("vendor không hợp lệ.");
  if (isInvalid(serialNumber)) errors.push("serialNumber không hợp lệ.");
  if (isInvalid(driveLetter)) errors.push("driveLetter không hợp lệ.");
  if (isInvalid(volumeName)) errors.push("volumeName không hợp lệ.");
  if (isInvalid(osUsername)) errors.push("osUsername không hợp lệ.");
  if (isInvalid(ipAddress)) errors.push("ipAddress không hợp lệ.");
  if (isInvalid(agentVersion)) errors.push("agentVersion không hợp lệ.");

  const eventType = body.eventType || "connected";
  if (!USB_EVENT_TYPES.includes(eventType)) {
    errors.push("eventType phải là connected hoặc disconnected.");
  }

  const deviceType = body.deviceType || "storage";
  if (!USB_DEVICE_TYPES.includes(deviceType)) {
    errors.push("deviceType không hợp lệ.");
  }

  // Gắn payload sự kiện đã chuẩn hóa (viết hoa deviceId, điền giá trị mặc định an toàn) vào request.usbAgentEvent
  request.usbAgentEvent = {
    deviceId: typeof deviceId === "string" ? deviceId.toUpperCase() : "",
    deviceName: typeof deviceName === "string" ? deviceName : "",
    vendor: typeof vendor === "string" && vendor ? vendor : "Unknown USB Vendor",
    serialNumber: typeof serialNumber === "string" ? serialNumber : null,
    deviceType,
    driveLetter: typeof driveLetter === "string" ? driveLetter : null,
    volumeName: typeof volumeName === "string" ? volumeName : null,
    eventType,
    hostname: typeof hostname === "string" ? hostname : "UNKNOWN-PC",
    osUsername: typeof osUsername === "string" ? osUsername : null,
    ipAddress: typeof ipAddress === "string" ? ipAddress : null,
    agentVersion: typeof agentVersion === "string" && agentVersion ? agentVersion : "1.0.0-win64",
  };

  return reject(errors, next);
}

/**
 * Middleware validate dữ liệu cập nhật chính sách bảo mật cho thiết bị USB (`PATCH /api/usb/:usbId/policy`).
 * Quy tắc: `status` (nếu có) thuộc ["trusted", "unverified", "blocked"], `assignedUserId` (nếu có)
 * là ObjectId hợp lệ hoặc null/rỗng để bỏ gán, `note` tối đa 1000 ký tự. Kết quả gắn vào `request.usbPolicyPayload`.
 */
export function validateUpdateUsbPolicy(request, _response, next) {
  const body = request.body ?? {};
  const errors = [];
  const result = {};

  if (body.status !== undefined) {
    if (!USB_DEVICE_STATUSES.includes(body.status)) {
      errors.push("Trạng thái chính sách USB không hợp lệ (trusted, unverified, blocked).");
    } else {
      result.status = body.status;
    }
  }

  // Cho phép gán cho nhân viên cụ thể hoặc gỡ bỏ gán bằng null / chuỗi rỗng
  if (body.assignedUserId !== undefined) {
    if (body.assignedUserId === null || body.assignedUserId === "") {
      result.assignedUser = null;
    } else if (!isValidId(body.assignedUserId)) {
      errors.push("ID nhân viên gán thiết bị không hợp lệ.");
    } else {
      result.assignedUser = body.assignedUserId;
    }
  }

  if (body.note !== undefined) {
    const note = text(body.note, 1000);
    if (isInvalid(note)) {
      errors.push("Ghi chú tối đa 1000 ký tự.");
    } else {
      result.note = note;
    }
  }

  request.usbPolicyPayload = result;
  return reject(errors, next);
}
