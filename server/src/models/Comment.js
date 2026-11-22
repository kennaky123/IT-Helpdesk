/**
 * @file Comment.js
 * @description Định nghĩa Mongoose Schema cho bình luận trao đổi và ghi chú nội bộ (Comment) trên Ticket.
 * Vai trò trong kiến trúc Backend: Thuộc tầng Model (Mongoose ODM), lưu trữ luồng hội thoại giữa
 * người tạo ticket và kỹ thuật viên, cũng như ghi chú nội bộ ẩn với người dùng cuối.
 */
import { Schema, createModel } from "../config/database.js";

/**
 * Sub-schema lưu metadata của ảnh đính kèm trong mỗi comment.
 * Chỉ chấp nhận các định dạng ảnh an toàn (JPEG, PNG, WEBP) và kích thước hợp lệ (>= 1 byte).
 */
const commentAttachmentSchema = new Schema(
  {
    // Tên tệp gốc do người dùng tải lên
    originalName: {
      type: String,
      required: true,
      trim: true,
    },
    // Khóa/tên tệp lưu trữ trên hệ thống file hoặc storage
    storageKey: {
      type: String,
      required: true,
      trim: true,
    },
    // Kiểu MIME hợp lệ của hình ảnh đính kèm
    mimeType: {
      type: String,
      required: true,
      enum: ["image/jpeg", "image/png", "image/webp"],
    },
    // Dung lượng tệp tính bằng byte
    sizeBytes: {
      type: Number,
      required: true,
      min: 1,
    },
    // Thời điểm tải tệp lên
    uploadedAt: {
      type: Date,
      default: Date.now,
      required: true,
    },
  },
  { _id: true },
);

/**
 * Hàm transform loại bỏ trường phiên bản `__v` khỏi kết quả JSON/Object.
 */
function removeVersionKey(_document, returnedObject) {
  delete returnedObject.__v;
  return returnedObject;
}

/**
 * Schema chính cho từng bình luận/ghi chú thuộc về một Ticket.
 * Các trường tham chiếu cốt lõi (`ticket`, `sender`, `isInternal`) được khóa `immutable: true` để tránh bị sửa đổi sau khi tạo.
 */
const commentSchema = new Schema(
  {
    // Ticket chứa comment này (không thể thay đổi sau khi tạo)
    ticket: {
      type: Schema.Types.ObjectId,
      ref: "Ticket",
      required: [true, "Ticket là bắt buộc."],
      immutable: true,
    },
    // Người gửi comment (không thể thay đổi sau khi tạo)
    sender: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Người gửi là bắt buộc."],
      immutable: true,
    },
    // Nội dung văn bản trao đổi (1 đến 5000 ký tự)
    content: {
      type: String,
      required: [true, "Nội dung trao đổi là bắt buộc."],
      trim: true,
      minlength: [1, "Nội dung trao đổi không được để trống."],
      maxlength: [5000, "Nội dung trao đổi không được vượt quá 5000 ký tự."],
    },
    // Danh sách ảnh đính kèm (kiểm tra tối đa 5 tệp bằng custom validator)
    attachments: {
      type: [commentAttachmentSchema],
      default: [],
      validate: {
        validator(value) {
          return value.length <= 5;
        },
        message: "Mỗi comment chỉ được có tối đa 5 tệp đính kèm.",
      },
    },
    // Cờ phân biệt ghi chú nội bộ (true: chỉ Technician/Admin xem được) và trao đổi công khai (false)
    isInternal: {
      type: Boolean,
      default: false,
      required: true,
      immutable: true,
    },
  },
  {
    timestamps: true,
    toJSON: { transform: removeVersionKey },
    toObject: { transform: removeVersionKey },
  },
);

// Index tối ưu lấy toàn bộ hội thoại của một ticket theo thứ tự thời gian & _id (hỗ trợ Admin/Technician)
commentSchema.index({ ticket: 1, createdAt: 1, _id: 1 });
// Index tối ưu lọc các bình luận công khai (isInternal: false) cho nhân viên tạo ticket
commentSchema.index({ ticket: 1, isInternal: 1, createdAt: 1, _id: 1 });

// Khởi tạo và xuất Mongoose Model "Comment"
const Comment = createModel("Comment", commentSchema);

export default Comment;
