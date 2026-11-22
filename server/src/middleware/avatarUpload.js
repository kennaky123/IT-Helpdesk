/**
 * @file avatarUpload.js
 * @description Middleware xử lý tải lên ảnh đại diện (avatar) của người dùng.
 * Vai trò trong kiến trúc Backend:
 * - Bọc cấu hình `upload.single("avatar")` của Multer để nhận tối đa 1 tệp ảnh ở trường `avatar`
 *   và chuyển tiếp lỗi upload (sai định dạng, vượt dung lượng...) sang `errorHandler`.
 */
import { upload } from "../config/upload.js";

/**
 * Middleware tiếp nhận multipart/form-data chứa trường tệp `avatar`.
 * Luồng xử lý: Gọi `upload.single("avatar")`; nếu Multer hoặc `fileFilter` trả về lỗi thì chuyển
 * trực tiếp qua `next(error)`, ngược lại chuyển tiếp sang bước xử lý tiếp theo với `request.file`.
 * @param {import("express").Request} request - Đối tượng HTTP request.
 * @param {import("express").Response} response - Đối tượng HTTP response.
 * @param {import("express").NextFunction} next - Hàm chuyển tiếp middleware.
 * @returns {void}
 */
export function uploadAvatarMiddleware(request, response, next) {
  upload.single("avatar")(request, response, (error) => {
    if (error) {
      return next(error);
    }
    next();
  });
}
