/**
 * @file authRoutes.js
 * @description Định nghĩa Express Router cho nghiệp vụ xác thực, phiên đăng nhập và quản lý hồ sơ cá nhân.
 * Vai trò trong kiến trúc Backend: Thuộc tầng Router (Express Router), gắn dưới tiền tố `/api/auth`.
 * Bao gồm các endpoint công khai (đăng ký, đăng nhập, xem ảnh đại diện) và các endpoint bảo vệ bằng JWT
 * (lấy thông tin bản thân, tải avatar, cập nhật hồ sơ, đổi mật khẩu).
 */
import { Router } from "express";
import {
  changePassword,
  getAvatar,
  getCurrentUser,
  login,
  register,
  updateAvatar,
  updateProfile,
} from "../controllers/authController.js";
import { authenticate } from "../middleware/authenticate.js";
import { uploadAvatarMiddleware } from "../middleware/avatarUpload.js";
import {
  validateChangePassword,
  validateLogin,
  validateRegister,
  validateUpdateProfile,
} from "../validators/authValidators.js";

const router = Router();

// POST /register - Đăng ký tài khoản người dùng mới (công khai); validate thông tin đăng ký trước khi tạo user
router.post("/register", validateRegister, register);

// POST /login - Đăng nhập bằng email & mật khẩu (công khai); validate định dạng đầu vào và trả JWT token
router.post("/login", validateLogin, login);

// GET /me - Lấy thông tin tài khoản hiện đang đăng nhập (yêu cầu JWT hợp lệ qua middleware authenticate)
router.get("/me", authenticate, getCurrentUser);

// GET /avatar/:filename - Phục vụ tệp ảnh đại diện tĩnh từ thư mục lưu trữ (công khai để thẻ <img> tải ảnh)
router.get("/avatar/:filename", getAvatar);

// POST /avatar - Tải lên và cập nhật ảnh đại diện cá nhân (yêu cầu đăng nhập + xử lý multipart upload qua multer)
router.post("/avatar", authenticate, uploadAvatarMiddleware, updateAvatar);

// PATCH /profile - Cập nhật thông tin hồ sơ cá nhân (họ tên, số điện thoại, phòng ban); yêu cầu JWT + validateUpdateProfile
router.patch(
  "/profile",
  authenticate,
  validateUpdateProfile,
  updateProfile,
);

// PATCH /change-password - Đổi mật khẩu của tài khoản đang đăng nhập; yêu cầu JWT + kiểm tra mật khẩu cũ/mới
router.patch(
  "/change-password",
  authenticate,
  validateChangePassword,
  changePassword,
);

export default router;
