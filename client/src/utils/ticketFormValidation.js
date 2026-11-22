import { z } from "zod";

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

export function validateImageFile(file, maxFileSizeMb) {
  const allowedMimeTypes = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
  ]);

  if (!allowedMimeTypes.has(file.type)) {
    return `${file.name}: chỉ chấp nhận ảnh JPEG, PNG hoặc WebP.`;
  }

  if (file.size === 0) {
    return `${file.name}: tệp ảnh đang trống.`;
  }

  if (file.size > maxFileSizeMb * 1024 * 1024) {
    return `${file.name}: dung lượng vượt quá ${maxFileSizeMb} MB.`;
  }

  return "";
}
