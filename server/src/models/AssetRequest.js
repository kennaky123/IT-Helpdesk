/**
 * @file AssetRequest.js
 * @description Định nghĩa Mongoose Schema cho yêu cầu cấp phát thiết bị IT (AssetRequest).
 * Vai trò trong kiến trúc Backend: Thuộc tầng Model (Mongoose ODM), theo dõi luồng công việc từ lúc
 * Admin tạo yêu cầu cấp máy cho nhân viên đến khi Technician tiếp nhận, chọn thiết bị trong kho và bàn giao.
 */
import { Schema, createModel } from "../config/database.js";
import { ASSET_REQUEST_STATUSES, ASSET_TYPES } from "../constants/asset.js";

/**
 * Schema lưu trữ thông tin yêu cầu cấp phát tài sản.
 * Tự động quản lý createdAt/updatedAt qua `{ timestamps: true, versionKey: false }`.
 */
const assetRequestSchema = new Schema(
  {
    // Mã yêu cầu cấp phát duy nhất (ví dụ: REQ-...), dùng để tra cứu nhanh
    requestCode: { type: String, required: true, unique: true, trim: true },
    // Nhân viên sẽ nhận thiết bị, đánh index để lọc nhanh các yêu cầu liên quan tới nhân viên
    employee: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    // Loại thiết bị được yêu cầu cấp (laptop, desktop, monitor...)
    assetType: { type: String, enum: ASSET_TYPES, default: "laptop" },
    // Ghi chú yêu cầu cấu hình hoặc lý do cấp thiết bị
    note: { type: String, default: null, trim: true, maxlength: 1000 },
    // Quản trị viên đã khởi tạo yêu cầu cấp phát
    requestedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // Kỹ thuật viên nhận xử lý yêu cầu, đánh index để lọc danh sách việc của từng KTV
    technician: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    // Thiết bị thực tế được lấy từ kho để bàn giao khi hoàn tất yêu cầu
    asset: { type: Schema.Types.ObjectId, ref: "Asset", default: null },
    // Trạng thái xử lý yêu cầu (pending, accepted, completed, cancelled), đánh index phục vụ lọc danh sách
    status: {
      type: String,
      enum: ASSET_REQUEST_STATUSES,
      default: "pending",
      index: true,
    },
    // Thời điểm kỹ thuật viên xác nhận tiếp nhận yêu cầu
    acceptedAt: { type: Date, default: null },
    // Thời điểm hoàn tất bàn giao thiết bị
    completedAt: { type: Date, default: null },
    // Thời điểm yêu cầu bị hủy
    cancelledAt: { type: Date, default: null },
    // Lý do hủy yêu cầu (nếu có)
    cancelReason: { type: String, default: null, trim: true, maxlength: 500 },
  },
  { timestamps: true, versionKey: false },
);

// Khởi tạo và xuất Mongoose Model "AssetRequest"
const AssetRequest = createModel("AssetRequest", assetRequestSchema);

export default AssetRequest;
