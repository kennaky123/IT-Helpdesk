/**
 * @file Category.js
 * @description Định nghĩa Mongoose Schema cho danh mục sự cố/yêu cầu hỗ trợ (Category).
 * Vai trò trong kiến trúc Backend: Thuộc tầng Model (Mongoose ODM), phân loại các nhóm vấn đề IT
 * (Phần cứng, Phần mềm, Mạng, Tài khoản...) để gắn vào Ticket và thống kê báo cáo.
 */
import { Schema, createModel } from "../config/database.js";

/**
 * Hàm chuyển đổi dữ liệu (transform) loại bỏ trường version `__v` của Mongoose
 * trước khi trả đối tượng JSON/Object ra API.
 */
function removeVersionKey(_document, returnedObject) {
  delete returnedObject.__v;
  return returnedObject;
}

/**
 * Schema quản lý danh mục Ticket.
 * Tự động thêm timestamps và áp dụng transform `removeVersionKey` khi serialize.
 */
const categorySchema = new Schema(
  {
    // Tên hiển thị của danh mục (từ 2 đến 100 ký tự)
    name: {
      type: String,
      required: [true, "Tên danh mục là bắt buộc."],
      trim: true,
      minlength: [2, "Tên danh mục phải có ít nhất 2 ký tự."],
      maxlength: [100, "Tên danh mục không được vượt quá 100 ký tự."],
    },
    // Định danh URL thân thiện duy nhất, chữ thường không dấu nối bằng dấu gạch ngang
    slug: {
      type: String,
      required: [true, "Slug danh mục là bắt buộc."],
      unique: true,
      lowercase: true,
      trim: true,
      match: [
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
        "Slug danh mục không đúng định dạng.",
      ],
    },
    // Mô tả chi tiết phạm vi hỗ trợ của danh mục
    description: {
      type: String,
      default: null,
      trim: true,
      maxlength: [500, "Mô tả danh mục không được vượt quá 500 ký tự."],
    },
    // Cờ kích hoạt danh mục (true: hiển thị cho người dùng chọn khi tạo ticket)
    isActive: {
      type: Boolean,
      default: true,
      required: true,
    },
    // Người tạo danh mục (Admin)
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    // Người cập nhật danh mục gần nhất
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: { transform: removeVersionKey },
    toObject: { transform: removeVersionKey },
  },
);

// Compound index tối ưu truy vấn lọc các danh mục đang hoạt động và sắp xếp theo tên tăng dần
categorySchema.index({ isActive: 1, name: 1 });

// Khởi tạo và xuất Mongoose Model "Category"
const Category = createModel("Category", categorySchema);

export default Category;
