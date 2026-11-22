/**
 * @file UsbDevice.js
 * @description Định nghĩa Mongoose Schema cho thiết bị USB được hệ thống Endpoint Agent giám sát.
 * Vai trò trong kiến trúc Backend: Thuộc tầng Model (Mongoose ODM), lưu danh mục phần cứng USB từng kết nối,
 * chính sách bảo mật (trusted, unverified, blocked), máy trạm gần nhất và người sở hữu được gán.
 */
import { Schema, createModel } from "../config/database.js";
import {
  USB_DEVICE_STATUSES,
  USB_DEVICE_TYPES,
} from "../constants/usb.js";

/**
 * Sub-schema lưu thông tin máy trạm (host) kết nối gần nhất với thiết bị USB.
 * Tắt `_id` (`{ _id: false }`) vì chỉ là đối tượng nhúng 1-1 trong UsbDevice.
 */
const lastHostSchema = new Schema(
  {
    // Tên máy tính Windows đã ghi nhận sự kiện USB
    hostname: {
      type: String,
      trim: true,
      default: "UNKNOWN-PC",
    },
    // Tên tài khoản Windows đang đăng nhập trên máy trạm
    osUsername: {
      type: String,
      trim: true,
      default: null,
    },
    // Địa chỉ IP nội bộ của máy trạm
    ipAddress: {
      type: String,
      trim: true,
      default: null,
    },
    // Thời điểm cắm thiết bị gần nhất
    connectedAt: {
      type: Date,
      default: null,
    },
    // Thời điểm rút thiết bị gần nhất
    disconnectedAt: {
      type: Date,
      default: null,
    },
  },
  { _id: false },
);

/**
 * Schema chính quản lý từng thiết bị USB duy nhất dựa trên `deviceId` phần cứng.
 */
const usbDeviceSchema = new Schema(
  {
    // Mã phần cứng định danh USB (PNPDeviceID / Hardware ID), duy nhất và tự động viết hoa
    deviceId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
    },
    // Tên thiết bị USB hiển thị từ hệ điều hành
    deviceName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    // Tên nhà sản xuất / Vendor thiết bị
    vendor: {
      type: String,
      trim: true,
      maxlength: 120,
      default: "Unknown Vendor",
    },
    // Số serial phần cứng của USB (nếu agent đọc được)
    serialNumber: {
      type: String,
      trim: true,
      maxlength: 120,
      default: null,
    },
    // Phân loại USB (storage, hid, other...)
    deviceType: {
      type: String,
      enum: USB_DEVICE_TYPES,
      default: "storage",
    },
    // Ký tự ổ đĩa được Windows gán (ví dụ: E:, F:)
    driveLetter: {
      type: String,
      trim: true,
      maxlength: 20,
      default: null,
    },
    // Tên nhãn phân vùng (Volume Label) của USB
    volumeName: {
      type: String,
      trim: true,
      maxlength: 120,
      default: null,
    },
    // Trạng thái chính sách bảo mật: trusted (tin cậy), unverified (chưa duyệt), blocked (chặn)
    status: {
      type: String,
      enum: USB_DEVICE_STATUSES,
      default: "unverified",
    },
    // Cờ cho biết thiết bị hiện đang cắm vào máy trạm hay đã rút
    isCurrentlyConnected: {
      type: Boolean,
      default: false,
    },
    // Thông tin máy trạm kết nối gần nhất
    lastHost: {
      type: lastHostSchema,
      default: () => ({}),
    },
    // Nhân viên được gán quyền sở hữu/sử dụng USB này
    assignedUser: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    // Quản trị viên hoặc KTV đã duyệt thay đổi chính sách cho USB
    reviewedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    // Ghi chú bảo mật hoặc lý do cấp/chặn thiết bị
    note: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: null,
    },
    // Tổng số lần kết nối đã ghi nhận của thiết bị USB
    connectionCount: {
      type: Number,
      default: 1,
      min: 0,
    },
  },
  {
    timestamps: true,
  },
);

// Compound index tối ưu hiển thị dashboard USB (lọc theo chính sách, ưu tiên thiết bị đang kết nối và mới cập nhật)
usbDeviceSchema.index({ status: 1, isCurrentlyConnected: -1, updatedAt: -1 });
// Index tối ưu tra cứu thiết bị theo tên máy trạm kết nối gần nhất
usbDeviceSchema.index({ "lastHost.hostname": 1 });

// Khởi tạo và xuất Model "UsbDevice" ánh xạ tới collection "usb_devices"
export const UsbDevice = createModel("UsbDevice", usbDeviceSchema, "usb_devices");
export default UsbDevice;
