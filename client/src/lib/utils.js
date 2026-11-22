/**
 * Tiện ích xử lý chuỗi class CSS dùng chung trong toàn bộ hệ thống UI components.
 * Vai trò: Kết hợp `clsx` (nối class theo điều kiện) và `tailwind-merge` (loại bỏ class Tailwind bị ghi đè/trùng lặp).
 */
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Gộp nhiều giá trị className (chuỗi, mảng, object điều kiện) và chuẩn hóa xung đột Tailwind CSS.
 */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
