/**
 * @file User.js
 * @description Định nghĩa Mongoose Schema cho tài khoản người dùng hệ thống (User, Technician, Admin).
 * Vai trò trong kiến trúc Backend: Thuộc tầng Model (Mongoose ODM), quản lý hồ sơ người dùng,
 * phân quyền theo vai trò, tự động mã hóa mật khẩu bằng bcrypt và cung cấp các phương thức xác thực JWT.
 */
import bcrypt from "bcrypt";
import { Schema, createModel } from "../config/database.js";
import { env } from "../config/env.js";

// Danh sách vai trò hợp lệ trong hệ thống (đóng băng chống chỉnh sửa)
export const USER_ROLES = Object.freeze(["user", "technician", "admin"]);
// Danh sách trạng thái tài khoản hợp lệ
export const USER_STATUSES = Object.freeze(["active", "inactive"]);

// Biểu thức chính quy kiểm tra định dạng email và số điện thoại
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^[0-9+().\s-]{8,20}$/;

/**
 * Hàm transform loại bỏ các trường bảo mật nhạy cảm (`password`, `passwordChangedAt`, `tokenVersion`, `__v`)
 * khi chuyển đổi document sang JSON hoặc Object thuần trả về cho client.
 */
function removePrivateFields(_document, returnedObject) {
  delete returnedObject.password;
  delete returnedObject.passwordChangedAt;
  delete returnedObject.tokenVersion;
  delete returnedObject.__v;
  return returnedObject;
}

/**
 * Schema người dùng hệ thống.
 * Áp dụng `select: false` cho các trường bảo mật để mặc định không truy xuất khỏi DB trừ khi chỉ định rõ.
 */
const userSchema = new Schema(
  {
    // Họ và tên đầy đủ của người dùng
    fullName: {
      type: String,
      required: [true, "Họ tên là bắt buộc."],
      trim: true,
      minlength: [2, "Họ tên phải có ít nhất 2 ký tự."],
      maxlength: [100, "Họ tên không được vượt quá 100 ký tự."],
    },
    // Địa chỉ email đăng nhập duy nhất, tự động chuyển chữ thường và gắn index tra cứu nhanh
    email: {
      type: String,
      required: [true, "Email là bắt buộc."],
      unique: true,
      index: true,
      lowercase: true,
      trim: true,
      maxlength: [254, "Email không được vượt quá 254 ký tự."],
      match: [emailPattern, "Email không đúng định dạng."],
    },
    // Mật khẩu đã hash bcrypt; ẩn mặc định (`select: false`) và giới hạn <= 72 byte theo đặc tả bcrypt
    password: {
      type: String,
      required: [true, "Mật khẩu là bắt buộc."],
      select: false,
      minlength: [8, "Mật khẩu phải có ít nhất 8 ký tự."],
      validate: {
        validator(value) {
          return Buffer.byteLength(value, "utf8") <= 72;
        },
        message: "Mật khẩu không được vượt quá 72 byte.",
      },
    },
    // Số điện thoại liên hệ
    phone: {
      type: String,
      default: null,
      trim: true,
      match: [phonePattern, "Số điện thoại không đúng định dạng."],
    },
    // Phòng ban công tác của nhân viên
    department: {
      type: String,
      default: null,
      trim: true,
      maxlength: [100, "Phòng ban không được vượt quá 100 ký tự."],
    },
    // Đường dẫn hoặc tên tệp ảnh đại diện
    avatar: {
      type: String,
      default: null,
      trim: true,
      maxlength: [500, "Đường dẫn ảnh đại diện không được vượt quá 500 ký tự."],
    },
    // Vai trò phân quyền hệ thống (mặc định là "user")
    role: {
      type: String,
      enum: {
        values: USER_ROLES,
        message: "Vai trò không hợp lệ.",
      },
      default: "user",
      required: true,
    },
    // Trạng thái hoạt động của tài khoản (active hoặc inactive/bị khóa)
    status: {
      type: String,
      enum: {
        values: USER_STATUSES,
        message: "Trạng thái tài khoản không hợp lệ.",
      },
      default: "active",
      required: true,
    },
    // Thời điểm đăng nhập thành công gần nhất
    lastLoginAt: {
      type: Date,
      default: null,
    },
    // Thời điểm đổi mật khẩu gần nhất (dùng để vô hiệu hóa các JWT phát hành trước đó)
    passwordChangedAt: {
      type: Date,
      default: null,
      select: false,
    },
    // Phiên bản token hiện hành (tăng lên khi cần buộc đăng xuất toàn bộ phiên cũ)
    tokenVersion: {
      type: Number,
      default: 0,
      min: 0,
      select: false,
    },
  },
  {
    timestamps: true,
    toJSON: { transform: removePrivateFields },
    toObject: { transform: removePrivateFields },
  },
);

// Compound index tối ưu truy vấn lọc danh sách người dùng theo vai trò và trạng thái hoạt động
userSchema.index({ role: 1, status: 1 });

/**
 * Mongoose pre-save hook: Tự động băm (hash) mật khẩu bằng bcrypt trước khi lưu vào MongoDB.
 * Chỉ thực hiện hash khi trường `password` thực sự được thêm mới hoặc chỉnh sửa.
 */
userSchema.pre("save", async function hashPassword() {
  if (!this.isModified("password")) {
    return;
  }

  // Băm mật khẩu với số vòng salt cấu hình từ biến môi trường
  this.password = await bcrypt.hash(this.password, env.bcryptSaltRounds);
});

/**
 * Instance method kiểm tra mật khẩu thô người dùng nhập có khớp với mật khẩu đã hash trong DB hay không.
 * @param {string} candidatePassword - Mật khẩu dạng văn bản thuần cần đối chiếu.
 * @returns {Promise<boolean>} True nếu mật khẩu trùng khớp, ngược lại là False.
 */
userSchema.methods.comparePassword = async function comparePassword(
  candidatePassword,
) {
  if (!this.password) {
    return false;
  }

  return bcrypt.compare(candidatePassword, this.password);
};

/**
 * Instance method kiểm tra mật khẩu có bị thay đổi sau thời điểm phát hành JWT hay không.
 * @param {number} jwtIssuedAt - Timestamp `iat` (tính bằng giây) trích xuất từ JWT payload.
 * @returns {boolean} True nếu mật khẩu đã đổi sau khi token được cấp (token hết hiệu lực).
 */
userSchema.methods.changedPasswordAfter = function changedPasswordAfter(
  jwtIssuedAt,
) {
  if (!this.passwordChangedAt || !jwtIssuedAt) {
    return false;
  }

  // Quy đổi thời gian đổi mật khẩu về đơn vị giây để so sánh khớp với trường iat của JWT
  const changedAtInSeconds = Math.floor(
    this.passwordChangedAt.getTime() / 1000,
  );
  return changedAtInSeconds > jwtIssuedAt;
};

// Khởi tạo và xuất Mongoose Model "User"
const User = createModel("User", userSchema);

export default User;
