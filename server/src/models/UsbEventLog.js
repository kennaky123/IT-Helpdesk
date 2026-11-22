/**
 * @file UsbEventLog.js
 * @description Định nghĩa Mongoose Schema lưu nhật ký sự kiện cắm/rút USB (UsbEventLog) từ các máy trạm.
 * Vai trò trong kiến trúc Backend: Thuộc tầng Model (Mongoose ODM), ghi nhận lịch sử kiểm toán (audit log)
 * mọi sự kiện USB gửi lên từ ITHelpdeskUSBAgent cùng trạng thái bảo mật tại thời điểm xảy ra.
 */
import { Schema, createModel } from "../config/database.js";
import {
  USB_DEVICE_STATUSES,
  USB_DEVICE_TYPES,
  USB_EVENT_TYPES,
} from "../constants/usb.js";

/**
 * Schema nhật ký sự kiện USB, lưu snapshot thông tin thiết bị và thông tin máy trạm phát sinh sự kiện.
 */
const usbEventLogSchema = new Schema(
  {
    // Tham chiếu tới bản ghi thiết bị USB tương ứng trong UsbDevice
    usbDevice: {
      type: Schema.Types.ObjectId,
      ref: "UsbDevice",
      required: true,
      index: true,
    },
    // Mã phần cứng thiết bị USB (viết hoa)
    deviceId: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    // Tên thiết bị USB tại thời điểm ghi log
    deviceName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    // Hãng sản xuất
    vendor: {
      type: String,
      trim: true,
      maxlength: 120,
      default: "Unknown Vendor",
    },
    // Số serial phần cứng
    serialNumber: {
      type: String,
      trim: true,
      maxlength: 120,
      default: null,
    },
    // Loại thiết bị USB (storage, hid...)
    deviceType: {
      type: String,
      enum: USB_DEVICE_TYPES,
      default: "storage",
    },
    // Ký tự ổ đĩa gắn trên máy trạm
    driveLetter: {
      type: String,
      trim: true,
      maxlength: 20,
      default: null,
    },
    // Nhãn phân vùng ổ USB
    volumeName: {
      type: String,
      trim: true,
      maxlength: 120,
      default: null,
    },
    // Loại sự kiện xảy ra (connected hoặc disconnected)
    eventType: {
      type: String,
      enum: USB_EVENT_TYPES,
      required: true,
    },
    // Trạng thái bảo mật của thiết bị ngay tại thời điểm xảy ra sự kiện (trusted, unverified, blocked)
    deviceStatusAtEvent: {
      type: String,
      enum: USB_DEVICE_STATUSES,
      default: "unverified",
    },
    // Tên máy trạm phát sinh sự kiện USB
    hostname: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    // Tên user hệ điều hành đang mở phiên làm việc
    osUsername: {
      type: String,
      trim: true,
      maxlength: 120,
      default: null,
    },
    // Địa chỉ IP của máy trạm
    ipAddress: {
      type: String,
      trim: true,
      maxlength: 80,
      default: null,
    },
    // Phiên bản phần mềm Agent chạy trên Windows đã gửi sự kiện
    agentVersion: {
      type: String,
      trim: true,
      maxlength: 40,
      default: "1.0.0-win64",
    },
  },
  {
    timestamps: true,
  },
);

// Index tối ưu truy vấn luồng nhật ký sự kiện USB gần nhất trên dashboard
usbEventLogSchema.index({ createdAt: -1 });
// Index tối ưu tra cứu lịch sử cắm/rút USB theo từng máy trạm cụ thể
usbEventLogSchema.index({ hostname: 1, createdAt: -1 });

// Khởi tạo và xuất Model "UsbEventLog" ánh xạ tới collection "usb_event_logs"
export const UsbEventLog = createModel("UsbEventLog", usbEventLogSchema, "usb_event_logs");
export default UsbEventLog;
