/**
 * @file Asset.js
 * @description Định nghĩa Mongoose Schema cho tài sản IT (Asset) và lịch sử thao tác vòng đời thiết bị.
 * Vai trò trong kiến trúc Backend: Thuộc tầng Model (Mongoose ODM), quản lý dữ liệu phần cứng
 * (laptop, PC, màn hình, thiết bị mạng...), trạng thái sử dụng, thông tin remote và nhật ký cấp phát/thu hồi.
 */
import { Schema, createModel } from "../config/database.js";
import {
  ASSET_HISTORY_ACTIONS,
  ASSET_STATUSES,
  ASSET_TYPES,
  REMOTE_TOOLS,
} from "../constants/asset.js";

/**
 * Sub-schema lưu trữ từng bản ghi lịch sử thay đổi/vòng đời của thiết bị (tạo mới, cấp phát, thu hồi, bảo trì...).
 * Tùy chọn `{ _id: true }` cho phép mỗi sự kiện lịch sử có ObjectId riêng để tham chiếu/sắp xếp.
 */
const assetHistorySchema = new Schema(
  {
    // Loại hành động thực hiện trên thiết bị (nằm trong danh sách ASSET_HISTORY_ACTIONS)
    action: { type: String, enum: ASSET_HISTORY_ACTIONS, required: true },
    // Nhân viên liên quan đến hành động (ví dụ: người nhận hoặc người trả thiết bị)
    user: { type: Schema.Types.ObjectId, ref: "User", default: null },
    // Quản trị viên hoặc kỹ thuật viên thực hiện thao tác
    performedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // Ghi chú chi tiết về lần thay đổi/bàn giao
    note: { type: String, default: null, trim: true, maxlength: 500 },
    // Thời điểm phát sinh hành động
    at: { type: Date, default: Date.now, required: true },
  },
  { _id: true },
);

/**
 * Schema chính quản lý tài sản thiết bị IT trong hệ thống.
 * Cấu hình `{ timestamps: true, versionKey: false }` tự động lưu createdAt/updatedAt và tắt trường __v.
 */
const assetSchema = new Schema(
  {
    // Mã tài sản nội bộ duy nhất (Asset Tag), tự động chuẩn hóa viết hoa và đánh index unique
    assetTag: {
      type: String,
      required: [true, "Mã thiết bị (Asset Tag) là bắt buộc."],
      unique: true,
      uppercase: true,
      trim: true,
      maxlength: 40,
    },
    // Tên thiết bị hiển thị (ví dụ: Dell Latitude 5430)
    name: {
      type: String,
      required: [true, "Tên thiết bị là bắt buộc."],
      trim: true,
      maxlength: 120,
    },
    // Phân loại thiết bị (laptop, desktop, monitor...), gắn index để tối ưu truy vấn lọc
    type: { type: String, enum: ASSET_TYPES, default: "laptop", index: true },
    // Số serial phần cứng của nhà sản xuất
    serialNumber: { type: String, default: null, trim: true, maxlength: 80 },
    // Thông số cấu hình kỹ thuật (CPU, RAM, SSD...)
    specs: { type: String, default: null, trim: true, maxlength: 300 },
    // Hệ điều hành đang cài đặt trên thiết bị
    os: { type: String, default: null, trim: true, maxlength: 80 },
    // Trạng thái hiện tại của thiết bị (in_stock, assigned, maintenance...), gắn index tối ưu bộ lọc
    status: {
      type: String,
      enum: ASSET_STATUSES,
      default: "in_stock",
      index: true,
    },
    // Tham chiếu tới nhân viên đang được cấp phát thiết bị, gắn index hỗ trợ tra cứu theo người dùng
    assignedTo: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    // Thời điểm thiết bị được bàn giao cho nhân viên hiện tại
    assignedAt: { type: Date, default: null },
    // Công cụ hỗ trợ từ xa cài trên máy (AnyDesk, TeamViewer, UltraViewer, none)
    remoteTool: { type: String, enum: REMOTE_TOOLS, default: "none" },
    // ID kết nối của phần mềm điều khiển từ xa
    remoteId: { type: String, default: null, trim: true, maxlength: 60 },
    // Ngày mua thiết bị
    purchaseDate: { type: Date, default: null },
    // Ghi chú bổ sung về tình trạng hoặc cấu hình thiết bị
    notes: { type: String, default: null, trim: true, maxlength: 500 },
    // Mảng lịch sử vòng đời các thao tác đã diễn ra trên thiết bị
    history: { type: [assetHistorySchema], default: [] },
  },
  { timestamps: true, versionKey: false },
);

// Khởi tạo và xuất Mongoose Model "Asset" ánh xạ tới collection assets
const Asset = createModel("Asset", assetSchema);

export default Asset;
