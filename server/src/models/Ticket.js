/**
 * @file Ticket.js
 * @description Định nghĩa Mongoose Schema trung tâm cho phiếu yêu cầu hỗ trợ IT (Ticket).
 * Vai trò trong kiến trúc Backend: Thuộc tầng Model (Mongoose ODM), lưu thông tin sự cố, tệp đính kèm,
 * vòng đời trạng thái, lịch sử phân công kỹ thuật viên, kết quả xử lý và cơ chế chống ghi đè đồng thời.
 */
import { Schema, createModel } from "../config/database.js";
import {
  TICKET_PRIORITIES,
  TICKET_STATUSES,
} from "../constants/ticket.js";

/**
 * Sub-schema lưu thông tin metadata của ảnh đính kèm khi người dùng tạo Ticket.
 * Giới hạn chỉ nhận ảnh JPEG, PNG, WEBP và có dung lượng >= 1 byte.
 */
const attachmentSchema = new Schema(
  {
    // Tên tệp gốc trên máy người dùng
    originalName: {
      type: String,
      required: true,
      trim: true,
    },
    // Tên khóa lưu trữ tệp thực tế trên máy chủ
    storageKey: {
      type: String,
      required: true,
      trim: true,
    },
    // Định dạng MIME cho phép
    mimeType: {
      type: String,
      required: true,
      enum: ["image/jpeg", "image/png", "image/webp"],
    },
    // Kích thước tệp tính theo byte
    sizeBytes: {
      type: Number,
      required: true,
      min: 1,
    },
    // Người tải tệp lên
    uploadedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // Thời điểm tải lên
    uploadedAt: {
      type: Date,
      default: Date.now,
      required: true,
    },
  },
  { _id: true },
);

/**
 * Sub-schema lưu vết mỗi lần chuyển đổi trạng thái của Ticket (phục vụ audit & timeline).
 */
const statusHistorySchema = new Schema(
  {
    // Trạng thái trước khi thay đổi (null khi mới tạo ticket)
    fromStatus: {
      type: String,
      enum: [...TICKET_STATUSES, null],
      default: null,
    },
    // Trạng thái mới chuyển sang
    toStatus: {
      type: String,
      enum: TICKET_STATUSES,
      required: true,
    },
    // Tài khoản thực hiện thay đổi trạng thái
    changedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // Ghi chú lý do hoặc diễn giải khi chuyển trạng thái (bắt buộc 1-500 ký tự)
    note: {
      type: String,
      required: [true, "Ghi chú thay đổi trạng thái là bắt buộc."],
      trim: true,
      minlength: [1, "Ghi chú thay đổi trạng thái không được để trống."],
      maxlength: [500, "Ghi chú thay đổi trạng thái không được vượt quá 500 ký tự."],
    },
    // Thời điểm chuyển trạng thái
    changedAt: {
      type: Date,
      default: Date.now,
      required: true,
    },
  },
  { _id: true },
);

/**
 * Sub-schema lưu vết lịch sử phân công hoặc chuyển giao Technician phụ trách Ticket.
 */
const assignmentHistorySchema = new Schema(
  {
    // Kỹ thuật viên phụ trách trước đó (null nếu là lần phân công đầu tiên)
    fromTechnician: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    // Kỹ thuật viên mới được phân công
    toTechnician: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // Người thực hiện phân công (Admin hoặc Technician tự nhận)
    assignedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // Lý do phân công / chuyển giao (không bắt buộc)
    reason: {
      type: String,
      default: null,
      trim: true,
      maxlength: 500,
    },
    // Thời điểm phân công
    assignedAt: {
      type: Date,
      default: Date.now,
      required: true,
    },
  },
  { _id: true },
);

/**
 * Hàm transform loại bỏ trường phiên bản `__v` khỏi JSON/Object trước khi phản hồi API.
 */
function removeVersionKey(_document, returnedObject) {
  delete returnedObject.__v;
  return returnedObject;
}

// Danh sách các trạng thái bắt buộc Ticket phải có kỹ thuật viên (`assignedTo`) phụ trách
const statusesRequiringTechnician = [
  "assigned",
  "in_progress",
  "waiting_user",
  "resolved",
  "closed",
];

// Danh sách các trạng thái bắt buộc phải có nội dung giải quyết (`resolution`) và thời điểm hoàn thành (`resolvedAt`)
const statusesRequiringResolution = ["resolved", "closed"];

/**
 * Schema chính của Ticket.
 * Bật `optimisticConcurrency: true` để tránh xung đột ghi đồng thời khi nhiều người cập nhật cùng 1 ticket.
 */
const ticketSchema = new Schema(
  {
    // Mã ticket định dạng HD-YYYY-NNNNNN, duy nhất và bất biến sau khi sinh
    ticketCode: {
      type: String,
      required: [true, "Mã ticket là bắt buộc."],
      unique: true,
      immutable: true,
      uppercase: true,
      trim: true,
      match: [/^HD-\d{4}-\d{6}$/, "Mã ticket không đúng định dạng."],
    },
    // Tiêu đề ngắn gọn mô tả sự cố (5 đến 200 ký tự)
    title: {
      type: String,
      required: [true, "Tiêu đề là bắt buộc."],
      trim: true,
      minlength: [5, "Tiêu đề phải có ít nhất 5 ký tự."],
      maxlength: [200, "Tiêu đề không được vượt quá 200 ký tự."],
    },
    // Mô tả chi tiết sự cố (10 đến 5000 ký tự)
    description: {
      type: String,
      required: [true, "Mô tả là bắt buộc."],
      trim: true,
      minlength: [10, "Mô tả phải có ít nhất 10 ký tự."],
      maxlength: [5000, "Mô tả không được vượt quá 5000 ký tự."],
    },
    // Tham chiếu đến danh mục sự cố
    category: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      required: [true, "Danh mục là bắt buộc."],
    },
    // Mức độ ưu tiên (low, medium, high, urgent)
    priority: {
      type: String,
      enum: {
        values: TICKET_PRIORITIES,
        message: "Mức độ ưu tiên không hợp lệ.",
      },
      default: "medium",
      required: true,
    },
    // Trạng thái xử lý hiện tại của ticket
    status: {
      type: String,
      enum: {
        values: TICKET_STATUSES,
        message: "Trạng thái ticket không hợp lệ.",
      },
      default: "pending",
      required: true,
    },
    // Người tạo yêu cầu hỗ trợ (bất biến)
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Người tạo ticket là bắt buộc."],
      immutable: true,
    },
    // Kỹ thuật viên được giao xử lý; bắt buộc nếu trạng thái nằm trong statusesRequiringTechnician
    assignedTo: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
      required: [
        function assignedToRequired() {
          return statusesRequiringTechnician.includes(this.status);
        },
        "Technician là bắt buộc với trạng thái hiện tại.",
      ],
    },
    // Mảng tệp ảnh đính kèm (tối đa 5 tệp)
    attachments: {
      type: [attachmentSchema],
      default: [],
      validate: {
        validator(value) {
          return value.length <= 5;
        },
        message: "Mỗi ticket chỉ được có tối đa 5 tệp đính kèm.",
      },
    },
    // Nội dung giải pháp xử lý của Technician; bắt buộc khi ticket chuyển sang resolved hoặc closed
    resolution: {
      type: String,
      default: null,
      trim: true,
      minlength: [1, "Nội dung giải quyết không được để trống."],
      maxlength: [5000, "Nội dung giải quyết không được vượt quá 5000 ký tự."],
      required: [
        function resolutionRequired() {
          return statusesRequiringResolution.includes(this.status);
        },
        "Nội dung giải quyết là bắt buộc khi ticket đã hoàn thành.",
      ],
    },
    // Các mốc thời gian vòng đời xử lý ticket
    assignedAt: {
      type: Date,
      default: null,
    },
    startedAt: {
      type: Date,
      default: null,
    },
    waitingUserAt: {
      type: Date,
      default: null,
    },
    // Thời điểm đánh dấu đã xử lý xong; bắt buộc khi trạng thái là resolved hoặc closed
    resolvedAt: {
      type: Date,
      default: null,
      required: [
        function resolvedAtRequired() {
          return statusesRequiringResolution.includes(this.status);
        },
        "Thời điểm giải quyết là bắt buộc khi ticket đã hoàn thành.",
      ],
    },
    closedAt: {
      type: Date,
      default: null,
    },
    // Thông tin hủy ticket (thời điểm, người hủy, lý do)
    cancelledAt: {
      type: Date,
      default: null,
    },
    cancelledBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    cancellationReason: {
      type: String,
      default: null,
      trim: true,
      maxlength: [500, "Lý do hủy không được vượt quá 500 ký tự."],
    },
    // Thời điểm có hoạt động tương tác gần nhất (comment, chuyển trạng thái, cập nhật)
    lastActivityAt: {
      type: Date,
      default: Date.now,
      required: true,
    },
    // Lịch sử các lần thay đổi trạng thái
    statusHistory: {
      type: [statusHistorySchema],
      default: [],
    },
    // Lịch sử các lần phân công kỹ thuật viên
    assignmentHistory: {
      type: [assignmentHistorySchema],
      default: [],
    },
  },
  {
    timestamps: true,
    optimisticConcurrency: true,
    toJSON: { transform: removeVersionKey },
    toObject: { transform: removeVersionKey },
  },
);

// Index tối ưu truy vấn danh sách ticket do một nhân viên tạo, sắp xếp mới nhất
ticketSchema.index({ createdBy: 1, createdAt: -1 });
// Index tối ưu truy vấn ticket đang giao cho một kỹ thuật viên theo trạng thái
ticketSchema.index({ assignedTo: 1, status: 1, createdAt: -1 });
// Index tối ưu bộ lọc danh sách ticket theo trạng thái và mức độ ưu tiên
ticketSchema.index({ status: 1, priority: 1, createdAt: -1 });
// Index tối ưu bộ lọc ticket theo danh mục và trạng thái
ticketSchema.index({ category: 1, status: 1, createdAt: -1 });
// Index tối ưu thống kê KPI các ticket đã giải quyết theo thời gian hoàn thành
ticketSchema.index({ status: 1, resolvedAt: -1 });
// Index tối ưu sắp xếp toàn bộ danh sách ticket mới nhất
ticketSchema.index({ createdAt: -1 });

// Khởi tạo và xuất Mongoose Model "Ticket"
const Ticket = createModel("Ticket", ticketSchema);

export default Ticket;
