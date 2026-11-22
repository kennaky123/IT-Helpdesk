/**
 * @file SoftwareLicense.js
 * @description Định nghĩa Mongoose Schema cho bản quyền phần mềm & gói SaaS (SoftwareLicense).
 * Vai trò trong kiến trúc Backend: Thuộc tầng Model (Mongoose ODM), quản lý thông tin license key,
 * số lượng seat, chi phí FinOps, ngày hết hạn và danh sách nhân viên được cấp phát bản quyền.
 */
import { Schema, createModel } from "../config/database.js";
import {
  BILLING_CYCLES,
  LICENSE_TYPES,
  SOFTWARE_CATEGORIES,
} from "../constants/software.js";

/**
 * Sub-schema lưu thông tin từng nhân viên đã được phân bổ một suất bản quyền (seat).
 */
const assignedUserSchema = new Schema(
  {
    // Tham chiếu tới tài khoản nhân viên đang sử dụng bản quyền
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // Thời điểm bắt đầu cấp phát seat cho nhân viên
    assignedAt: {
      type: Date,
      default: Date.now,
      required: true,
    },
    // Ghi chú cấp phát (ví dụ: tài khoản kích hoạt, phòng ban)
    note: {
      type: String,
      default: null,
      trim: true,
      maxlength: 300,
    },
  },
  { _id: true },
);

/**
 * Schema chính lưu trữ thông tin bản quyền phần mềm và chi phí định kỳ.
 */
const softwareLicenseSchema = new Schema(
  {
    // Tên phần mềm / dịch vụ (ví dụ: Microsoft 365 Business, JetBrains All Products)
    name: {
      type: String,
      required: [true, "Tên phần mềm là bắt buộc."],
      trim: true,
      maxlength: 150,
    },
    // Nhà cung cấp hoặc hãng phát hành phần mềm
    vendor: {
      type: String,
      required: [true, "Nhà cung cấp / Hãng phần mềm là bắt buộc."],
      trim: true,
      maxlength: 100,
    },
    // Danh mục phần mềm, gắn index để tối ưu lọc theo nhóm
    category: {
      type: String,
      enum: SOFTWARE_CATEGORIES,
      default: "Văn phòng & Email",
      index: true,
    },
    // Hình thức cấp phép (saas_subscription, perpetual, volume...), gắn index phục vụ thống kê
    type: {
      type: String,
      enum: LICENSE_TYPES,
      default: "saas_subscription",
      index: true,
    },
    // Mã kích hoạt / License Key (nếu có)
    licenseKey: {
      type: String,
      default: null,
      trim: true,
      maxlength: 300,
    },
    // Đường dẫn trang quản trị (Admin Portal) của nhà cung cấp
    portalUrl: {
      type: String,
      default: null,
      trim: true,
      maxlength: 255,
    },
    // Tổng số bản quyền (Seats) đã mua, tối thiểu 1
    totalSeats: {
      type: Number,
      required: [true, "Tổng số bản quyền (Seats) là bắt buộc."],
      min: [1, "Tổng số bản quyền phải có ít nhất 1."],
    },
    // Đơn giá trên mỗi seat (phục vụ tính toán chi phí FinOps)
    costPerSeat: {
      type: Number,
      default: 0,
      min: [0, "Chi phí không được âm."],
    },
    // Đơn vị tiền tệ (VND, USD...), tự động chuyển chữ hoa
    currency: {
      type: String,
      default: "VND",
      uppercase: true,
      trim: true,
      maxlength: 10,
    },
    // Chu kỳ thanh toán (monthly, yearly, one_time...)
    billingCycle: {
      type: String,
      enum: BILLING_CYCLES,
      default: "yearly",
    },
    // Ngày bắt đầu mua/đăng ký bản quyền
    purchaseDate: {
      type: Date,
      default: Date.now,
    },
    // Ngày hết hạn bản quyền (null đối với bản quyền vĩnh viễn), gắn index để quét các gói sắp hết hạn
    expiryDate: {
      type: Date,
      default: null,
      index: true,
    },
    // Danh sách nhân viên đang nắm giữ seat bản quyền
    assignedUsers: {
      type: [assignedUserSchema],
      default: [],
    },
    // Ghi chú hợp đồng hoặc hướng dẫn kích hoạt
    notes: {
      type: String,
      default: null,
      trim: true,
      maxlength: 1000,
    },
    // Người tạo bản ghi license
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    // Người cập nhật bản ghi license gần nhất
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true, versionKey: false },
);

/**
 * Instance method tính toán trạng thái hiệu lực hiện tại của bản quyền dựa trên ngày hết hạn.
 * @param {Date} [now=new Date()] - Mốc thời gian hiện tại dùng để so sánh.
 * @returns {"active"|"expiring_soon"|"expired"} Trạng thái bản quyền (còn hạn, sắp hết hạn <= 30 ngày, hoặc đã hết hạn).
 */
// Virtual calculation for status
softwareLicenseSchema.methods.calculateStatus = function (now = new Date()) {
  // Bản quyền vĩnh viễn không có ngày hết hạn hoặc không đặt expiryDate luôn ở trạng thái active
  if (this.type === "perpetual" && !this.expiryDate) {
    return "active";
  }
  if (!this.expiryDate) {
    return "active";
  }

  // Tính số ngày còn lại đến ngày hết hạn (làm tròn lên theo ngày)
  const expTime = new Date(this.expiryDate).getTime();
  const nowTime = now.getTime();
  const diffDays = Math.ceil((expTime - nowTime) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return "expired";
  }
  if (diffDays <= 30) {
    return "expiring_soon";
  }
  return "active";
};

// Khởi tạo và xuất Mongoose Model "SoftwareLicense"
const SoftwareLicense = createModel("SoftwareLicense", softwareLicenseSchema);

export default SoftwareLicense;
