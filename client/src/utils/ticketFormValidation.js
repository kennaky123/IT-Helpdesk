/**
 * @file ticketFormValidation.js
 * @description Cấu hình các tùy chọn độ ưu tiên, schema kiểm chứng form tạo ticket (Zod) và kiểm tra tệp ảnh đính kèm.
 * Vai trò trong kiến trúc Frontend: Thuộc tầng Utility helpers, cung cấp quy tắc validate đầu vào
 * đồng bộ cho form gửi yêu cầu hỗ trợ (`react-hook-form` + `@hookform/resolvers/zod`).
 */
import { z } from "zod";

/**
 * Danh sách bất biến các mức độ ưu tiên của ticket kèm nhãn và mô tả hướng dẫn lựa chọn.
 */
export const PRIORITY_OPTIONS = Object.freeze([
  {
    value: "low",
    label: "Thấp",
    description: "Không ảnh hưởng đến công việc hiện tại",
  },
  {
    value: "medium",
    label: "Trung bình",
    description: "Ảnh hưởng một phần đến công việc",
  },
  {
    value: "high",
    label: "Cao",
    description: "Công việc bị gián đoạn đáng kể",
  },
  {
    value: "urgent",
    label: "Khẩn cấp",
    description: "Hệ thống hoặc công việc quan trọng bị dừng",
  },
]);

/**
 * Schema Zod kiểm tra dữ liệu đầu vào khi người dùng tạo mới yêu cầu hỗ trợ (ticket).
 * Ràng buộc:
 * - `title`: Chuỗi 5–200 ký tự sau khi trim.
 * - `category`: Bắt buộc chọn ít nhất 1 danh mục.
 * - `priority`: Thuộc 1 trong 4 mức (`low`, `medium`, `high`, `urgent`).
 * - `technicianId`: Tùy chọn chỉ định kỹ thuật viên, mặc định chuỗi rỗng.
 * - `description`: Mô tả chi tiết 10–5000 ký tự sau khi trim.
 */
export const ticketRequestSchema = z.object({
  title: z
    .string()
    .trim()
    .min(5, "Tiêu đề phải có ít nhất 5 ký tự.")
    .max(200, "Tiêu đề không được vượt quá 200 ký tự."),
  category: z.string().trim().min(1, "Vui lòng chọn danh mục sự cố."),
  priority: z.enum(["low", "medium", "high", "urgent"], {
    errorMap: () => ({ message: "Vui lòng chọn mức độ ưu tiên hợp lệ." }),
  }),
  technicianId: z.string().optional().default(""),
  description: z
    .string()
    .trim()
    .min(10, "Mô tả chi tiết phải có ít nhất 10 ký tự.")
    .max(5000, "Mô tả không được vượt quá 5000 ký tự."),
});

/**
 * Kiểm tra tính hợp lệ của một tệp ảnh đính kèm trước khi thêm vào danh sách upload.
 *
 * @param {File} file - Đối tượng File người dùng chọn hoặc kéo thả.
 * @param {number} maxFileSizeMb - Giới hạn dung lượng tối đa cho phép (đơn vị MB).
 * @returns {string} Chuỗi thông báo lỗi tiếng Việt nếu vi phạm, hoặc chuỗi rỗng `""` nếu hợp lệ.
 */
export function validateImageFile(file, maxFileSizeMb) {
  // Chỉ cho phép các định dạng ảnh phổ biến an toàn
  const allowedMimeTypes = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
  ]);

  if (!allowedMimeTypes.has(file.type)) {
    return `${file.name}: chỉ chấp nhận ảnh JPEG, PNG hoặc WebP.`;
  }

  // Từ chối tệp rỗng (0 byte) tránh lỗi upload không nội dung
  if (file.size === 0) {
    return `${file.name}: tệp ảnh đang trống.`;
  }

  // Kiểm tra dung lượng theo đơn vị byte (MB * 1024 * 1024)
  if (file.size > maxFileSizeMb * 1024 * 1024) {
    return `${file.name}: dung lượng vượt quá ${maxFileSizeMb} MB.`;
  }

  return "";
}
