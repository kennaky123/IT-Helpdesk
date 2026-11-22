/**
 * @file ticketAttachmentUpload.js
 * @description Chuỗi middleware xử lý tải lên, kiểm tra chữ ký nhị phân (magic bytes) và dọn dẹp ảnh đính kèm cho ticket/comment.
 * Vai trò trong kiến trúc Backend:
 * - Nhận nhiều tệp ảnh qua Multer ở field `attachments`.
 * - Xác thực nội dung tệp thực tế trên đĩa (tránh trường hợp đổi đuôi tệp hoặc giả mạo Content-Type).
 * - Tự động xóa các tệp đã ghi lên đĩa nếu bất kỳ bước xử lý nào phía sau phát sinh lỗi.
 */
import { open } from "node:fs/promises";
import { env } from "../config/env.js";
import { removeUploadedFiles, upload } from "../config/upload.js";
import ApiError from "../utils/ApiError.js";

/**
 * Kiểm tra các byte đầu tiên (magic bytes / file signature) của tệp có khớp với MIME type khai báo hay không.
 * @param {string} mimeType - MIME type do Multer/client cung cấp (`image/jpeg`, `image/png`, `image/webp`).
 * @param {Buffer} header - Bộ đệm chứa tối đa 12 byte đầu của tệp.
 * @returns {boolean} `true` nếu chữ ký nhị phân khớp đúng định dạng ảnh, ngược lại `false`.
 */
function hasExpectedImageSignature(mimeType, header) {
  // JPEG luôn bắt đầu bằng 3 byte FF D8 FF
  if (mimeType === "image/jpeg") {
    return header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
  }

  // PNG bắt đầu bằng chuỗi 8 byte cố định: 89 50 4E 47 0D 0A 1A 0A
  if (mimeType === "image/png") {
    return header.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
  }

  // WebP sử dụng container RIFF: byte 0..3 là "RIFF" và byte 8..11 là "WEBP"
  if (mimeType === "image/webp") {
    return (
      header.subarray(0, 4).toString("ascii") === "RIFF" &&
      header.subarray(8, 12).toString("ascii") === "WEBP"
    );
  }

  return false;
}

/**
 * Mở tệp vừa upload, đọc 12 byte đầu tiên và xác minh chữ ký ảnh thực tế.
 * @param {Express.Multer.File} file - Đối tượng thông tin tệp do Multer lưu xuống đĩa.
 * @returns {Promise<boolean>} `true` nếu tệp là ảnh hợp lệ.
 */
async function hasValidImageContent(file) {
  const fileHandle = await open(file.path, "r");

  try {
    const header = Buffer.alloc(12);
    const { bytesRead } = await fileHandle.read(header, 0, header.length, 0);
    return bytesRead > 0 && hasExpectedImageSignature(file.mimetype, header);
  } finally {
    // Luôn đóng file descriptor kể cả khi xảy ra lỗi đọc tệp
    await fileHandle.close();
  }
}

/**
 * Middleware tiếp nhận tối đa `env.maxFilesPerTicket` tệp đính kèm từ trường `attachments`.
 * @param {import("express").Request} request - Đối tượng HTTP request.
 * @param {import("express").Response} response - Đối tượng HTTP response.
 * @param {import("express").NextFunction} next - Hàm chuyển tiếp middleware.
 * @returns {void}
 */
export function uploadTicketAttachments(request, response, next) {
  upload.array("attachments", env.maxFilesPerTicket)(
    request,
    response,
    (error) => next(error),
  );
}

/**
 * Middleware hậu kiểm nội dung nhị phân cho toàn bộ tệp ảnh trong `request.files`.
 * Luồng xử lý: Kiểm tra song song từng tệp qua `hasValidImageContent`; nếu có tệp không khớp chữ ký
 * ảnh thực tế thì trả về `ApiError(400)` để middleware cleanup xóa tệp và báo lỗi cho client.
 * @param {import("express").Request} request - Đối tượng HTTP request.
 * @param {import("express").Response} _response - Đối tượng HTTP response (không dùng).
 * @param {import("express").NextFunction} next - Hàm chuyển tiếp middleware.
 * @returns {Promise<void>}
 */
export async function validateTicketAttachmentContent(
  request,
  _response,
  next,
) {
  try {
    const files = request.files ?? [];
    // Kiểm tra chữ ký nhị phân song song cho tất cả ảnh vừa upload
    const validationResults = await Promise.all(
      files.map((file) => hasValidImageContent(file)),
    );
    const invalidFileIndex = validationResults.findIndex((isValid) => !isValid);

    if (invalidFileIndex >= 0) {
      return next(
        new ApiError(
          400,
          `Nội dung tệp ${files[invalidFileIndex].originalname} không phải ảnh hợp lệ.`,
        ),
      );
    }

    return next();
  } catch (error) {
    return next(error);
  }
}

/**
 * Error-handling middleware dọn dẹp các tệp đã upload khi luồng xử lý gặp lỗi.
 * Luồng xử lý: Xóa toàn bộ tệp trong `request.files` khỏi ổ đĩa, đặt lại mảng rỗng
 * và tiếp tục đẩy `error` sang `errorHandler` tập trung.
 * @param {Error} error - Lỗi phát sinh từ validation hoặc controller trước đó.
 * @param {import("express").Request} request - Đối tượng HTTP request.
 * @param {import("express").Response} _response - Đối tượng HTTP response (không dùng).
 * @param {import("express").NextFunction} next - Hàm chuyển tiếp lỗi.
 * @returns {Promise<void>}
 */
export async function cleanupTicketAttachmentUpload(
  error,
  request,
  _response,
  next,
) {
  await removeUploadedFiles(request.files);
  request.files = [];
  next(error);
}
