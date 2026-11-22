/**
 * @file Rating.js
 * @description Định nghĩa Mongoose Schema cho đánh giá mức độ hài lòng (Rating) sau khi xử lý Ticket.
 * Vai trò trong kiến trúc Backend: Thuộc tầng Model (Mongoose ODM), lưu điểm sao (1-5) và nhận xét
 * của người dùng về kỹ thuật viên xử lý, phục vụ thống kê KPI chất lượng hỗ trợ.
 */
import { Schema, createModel } from "../config/database.js";

// Tập hợp các mức điểm đánh giá hợp lệ (từ 1 đến 5 sao), đóng băng để chống chỉnh sửa
export const RATING_SCORES = Object.freeze([1, 2, 3, 4, 5]);

/**
 * Hàm transform loại bỏ trường `__v` khi chuyển document sang JSON/Object.
 */
function removeVersionKey(_document, returnedObject) {
  delete returnedObject.__v;
  return returnedObject;
}

/**
 * Schema lưu trữ đánh giá của một Ticket đã hoàn thành.
 * Thiết lập `unique: true` cho `ticket` để đảm bảo mỗi ticket chỉ có duy nhất một bản ghi đánh giá.
 */
const ratingSchema = new Schema(
  {
    // Ticket được đánh giá (duy nhất và bất biến)
    ticket: {
      type: Schema.Types.ObjectId,
      ref: "Ticket",
      required: [true, "Ticket là bắt buộc."],
      immutable: true,
      unique: true,
    },
    // Người dùng gửi đánh giá (bất biến)
    ratedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Người đánh giá là bắt buộc."],
      immutable: true,
    },
    // Kỹ thuật viên nhận đánh giá (bất biến)
    technician: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Technician được đánh giá là bắt buộc."],
      immutable: true,
    },
    // Điểm đánh giá bắt buộc nằm trong tập số nguyên [1, 2, 3, 4, 5]
    score: {
      type: Number,
      required: [true, "Điểm đánh giá là bắt buộc."],
      enum: {
        values: RATING_SCORES,
        message: "Điểm đánh giá phải là số nguyên từ 1 đến 5.",
      },
    },
    // Nhận xét chi tiết bổ sung từ người dùng (tối đa 1000 ký tự)
    feedback: {
      type: String,
      default: null,
      trim: true,
      maxlength: [
        1000,
        "Nội dung đánh giá không được vượt quá 1000 ký tự.",
      ],
    },
  },
  {
    timestamps: true,
    toJSON: { transform: removeVersionKey },
    toObject: { transform: removeVersionKey },
  },
);

// Index tối ưu truy vấn tổng hợp điểm và danh sách đánh giá mới nhất của từng kỹ thuật viên
ratingSchema.index({ technician: 1, createdAt: -1 });
// Index tối ưu tra cứu các đánh giá do một người dùng đã gửi
ratingSchema.index({ ratedBy: 1, createdAt: -1 });
// Index tối ưu lọc/báo cáo đánh giá theo mức điểm sao mới nhất
ratingSchema.index({ score: 1, createdAt: -1 });

// Khởi tạo và xuất Mongoose Model "Rating"
const Rating = createModel("Rating", ratingSchema);

export default Rating;
