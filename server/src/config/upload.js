/**
 * @file upload.js
 * @description Cấu hình Multer và các tiện ích quản lý tệp tải lên trên ổ đĩa.
 * Vai trò trong kiến trúc Backend:
 * - Thiết lập thư mục lưu trữ, cơ chế đặt tên tệp ngẫu nhiên và giới hạn kích thước/số lượng tệp.
 * - Kiểm tra MIME type cho phép (JPEG, PNG, WebP) trước khi lưu.
 * - Cung cấp hàm dọn dẹp tệp rác khi lỗi và truy xuất đường dẫn tệp an toàn chống Path Traversal.
 */
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import multer from "multer";
import { env } from "./env.js";
import ApiError from "../utils/ApiError.js";

/** Đường dẫn tuyệt đối tới thư mục gốc của server (`server/`). */
const serverRoot = fileURLToPath(new URL("../../", import.meta.url));
/** Đường dẫn tuyệt đối tới thư mục lưu trữ tệp tải lên (`server/uploads` hoặc theo `UPLOAD_DIR`). */
const uploadDirectory = path.resolve(serverRoot, env.uploadDir);
/** Tập hợp MIME type hình ảnh được hệ thống chấp nhận khi upload. */
const allowedMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
/** Ánh xạ MIME type hợp lệ sang phần mở rộng tệp an toàn khi lưu xuống đĩa. */
const extensionByMimeType = Object.freeze({
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
});

// Đảm bảo thư mục lưu trữ tồn tại ngay khi module được nạp
mkdirSync(uploadDirectory, { recursive: true });

/**
 * Cấu hình lưu trữ tệp trên ổ đĩa cục bộ cho Multer.
 * Sinh tên tệp duy nhất theo định dạng `<timestamp>-<uuid><ext>` nhằm tránh ghi đè và loại bỏ tên gốc từ client.
 */
const storage = multer.diskStorage({
  destination: uploadDirectory,
  filename: (_request, file, callback) => {
    const extension = extensionByMimeType[file.mimetype];
    callback(null, `${Date.now()}-${randomUUID()}${extension}`);
  },
});

/**
 * Bộ lọc tệp đầu vào của Multer dựa trên `file.mimetype`.
 * @param {import("express").Request} _request - Đối tượng HTTP request (không sử dụng).
 * @param {Express.Multer.File} file - Metadata tệp đang được tải lên.
 * @param {import("multer").FileFilterCallback} callback - Callback quyết định chấp nhận hay từ chối tệp.
 * @returns {void}
 */
function fileFilter(_request, file, callback) {
  // Chặn sớm các tệp có MIME type không nằm trong danh sách ảnh cho phép
  if (!allowedMimeTypes.has(file.mimetype)) {
    callback(new ApiError(400, "Chỉ chấp nhận ảnh JPEG, PNG hoặc WebP."));
    return;
  }

  callback(null, true);
}

/**
 * Instance Multer dùng chung cho các middleware upload (avatar, tệp đính kèm ticket/comment).
 * Áp dụng giới hạn dung lượng mỗi tệp và số lượng tệp tối đa từ biến môi trường.
 */
export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: env.maxFileSizeMb * 1024 * 1024,
    files: env.maxFilesPerTicket,
  },
});

/**
 * Xóa danh sách các tệp đã upload lên đĩa trong trường hợp xử lý request gặp lỗi hoặc validation thất bại.
 * @param {Array<{path?: string}>} [files=[]] - Mảng thông tin tệp do Multer tạo ra (`request.files` hoặc `[request.file]`).
 * @returns {Promise<void>}
 */
export async function removeUploadedFiles(files = []) {
  const paths = files
    .map((file) => file?.path)
    .filter((filePath) => typeof filePath === "string" && filePath.length > 0);

  // Dùng allSettled để việc xóa một tệp lỗi không làm gián đoạn xóa các tệp còn lại
  await Promise.allSettled(paths.map((filePath) => unlink(filePath)));
}

/**
 * Phân giải `storageKey` (tên tệp lưu trữ) thành đường dẫn tuyệt đối an toàn trong `uploadDirectory`.
 * @param {string} storageKey - Tên tệp lưu trữ (không được chứa dấu phân cách thư mục như `../`).
 * @throws {ApiError} Ném lỗi 404 nếu `storageKey` rỗng hoặc có dấu hiệu Path Traversal.
 * @returns {string} Đường dẫn tuyệt đối tới tệp trên hệ thống tệp.
 */
export function getUploadedFilePath(storageKey) {
  // Kiểm tra path.basename(storageKey) === storageKey để ngăn chặn truy cập ra ngoài thư mục upload
  if (
    typeof storageKey !== "string" ||
    storageKey.length === 0 ||
    path.basename(storageKey) !== storageKey
  ) {
    throw new ApiError(404, "Không tìm thấy tệp đính kèm.");
  }

  return path.resolve(uploadDirectory, storageKey);
}
