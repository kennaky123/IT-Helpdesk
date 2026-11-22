/**
 * @file adminUserFormatters.js
 * @description Tập hợp các hàm tiện ích định dạng dữ liệu hiển thị và tìm kiếm người dùng trong khu vực quản trị.
 * Vai trò trong kiến trúc Frontend: Thuộc tầng Utility helpers, chuẩn hóa ngày giờ theo múi giờ Việt Nam,
 * tạo chữ cái viết tắt avatar, phân giải URL ảnh đại diện và chuẩn hóa chuỗi tiếng Việt không dấu.
 */
import { clientEnv } from "../config/env.js";

// Bộ định dạng ngày (dd/mm/yyyy) cố định theo chuẩn Việt Nam và múi giờ Asia/Ho_Chi_Minh
const dateFormatter = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "Asia/Ho_Chi_Minh",
});

// Bộ định dạng đầy đủ ngày và giờ ngắn gọn cho mốc thời gian đăng nhập gần nhất
const dateTimeFormatter = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Ho_Chi_Minh",
});

/**
 * Định dạng giá trị ngày (ví dụ ngày tạo tài khoản) sang dạng `dd/mm/yyyy`.
 *
 * @param {string | number | Date | null | undefined} value - Giá trị thời gian đầu vào.
 * @returns {string} Ngày đã định dạng hoặc `"—"` nếu rỗng/không hợp lệ.
 */
export function formatUserDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : dateFormatter.format(date);
}

/**
 * Định dạng thời điểm đăng nhập gần nhất của người dùng.
 *
 * @param {string | number | Date | null | undefined} value - Mốc thời gian đăng nhập cuối.
 * @returns {string} Chuỗi ngày giờ, `"Chưa đăng nhập"` nếu rỗng, hoặc `"—"` nếu ngày không hợp lệ.
 */
export function formatUserDateTime(value) {
  if (!value) return "Chưa đăng nhập";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : dateTimeFormatter.format(date);
}

/**
 * Lấy tối đa 2 chữ cái đầu (viết hoa) của hai từ cuối trong họ tên để làm avatar dự phòng.
 *
 * @param {string} [fullName=""] - Họ và tên đầy đủ của người dùng.
 * @returns {string} Chuỗi chữ cái viết tắt (vd: "Nguyễn Văn An" -> "VA").
 */
export function getInitials(fullName = "") {
  return fullName
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map((word) => word[0]?.toUpperCase())
    .join("");
}

/**
 * Phân giải đường dẫn ảnh đại diện đầy đủ từ giá trị lưu trong hồ sơ người dùng.
 *
 * @param {string | null | undefined} avatar - Tên tệp avatar hoặc URL đầy đủ / data URI.
 * @returns {string | null} URL sẵn sàng gắn vào thẻ `<img>`, hoặc `null` nếu không có avatar.
 */
export function getAvatarUrl(avatar) {
  if (!avatar || typeof avatar !== "string") return null;
  // Giữ nguyên nếu avatar đã là đường dẫn tuyệt đối hoặc Data URL xem trước
  if (
    avatar.startsWith("http://") ||
    avatar.startsWith("https://") ||
    avatar.startsWith("data:")
  ) {
    return avatar;
  }
  // Ghép tiền tố API endpoint khi Backend chỉ trả về tên file avatar
  return `${clientEnv.apiUrl}/auth/avatar/${avatar}`;
}

/**
 * Chuẩn hóa chuỗi tìm kiếm bằng cách bỏ dấu tiếng Việt, chuyển chữ thường và cắt khoảng trắng thừa.
 *
 * @param {string} [value=""] - Chuỗi văn bản cần chuẩn hóa để so khớp tìm kiếm.
 * @returns {string} Chuỗi không dấu viết thường.
 */
export function normalizeSearch(value = "") {
  // Tách ký tự tổ hợp Unicode (NFD) rồi loại bỏ toàn bộ dấu thanh/dấu mũ trong dải U+0300–U+036F
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}
