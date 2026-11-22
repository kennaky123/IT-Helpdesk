/**
 * Quản lý cấu hình biến môi trường phía client (Vite `import.meta.env`).
 * Vai trò: Cung cấp địa chỉ API Backend linh hoạt (hỗ trợ cả localhost và truy cập từ IP mạng LAN)
 * cùng các giới hạn cấu hình upload tệp đính kèm của ticket.
 */

// URL API dự phòng khi không khai báo VITE_API_URL và đang chạy cục bộ
const fallbackApiUrl = "http://127.0.0.1:5000/api";

/**
 * Ép kiểu giá trị cấu hình sang số nguyên dương; trả về giá trị mặc định nếu không hợp lệ.
 */
function parsePositiveInteger(value, fallback) {
  const parsedValue = Number.parseInt(value, 10);
  return Number.isInteger(parsedValue) && parsedValue > 0
    ? parsedValue
    : fallback;
}

/**
 * Tự động xác định URL gốc của API Backend dựa trên biến môi trường và hostname hiện tại của trình duyệt.
 * Khi mở web từ máy khác trong mạng LAN (ví dụ http://192.168.1.6:5173), hàm sẽ thay thế
 * localhost/127.0.0.1 bằng chính IP LAN đang mở trang để tránh gọi nhầm về máy khách.
 */
function resolveApiUrl() {
  const configuredUrl = import.meta.env.VITE_API_URL?.trim();
  const browserHost =
    typeof window !== "undefined" && window.location?.hostname
      ? window.location.hostname
      : "";

  if (
    browserHost &&
    browserHost !== "127.0.0.1" &&
    browserHost !== "localhost"
  ) {
    if (!configuredUrl) {
      return `http://${browserHost}:5000/api`;
    }
    if (/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/i.test(configuredUrl)) {
      return configuredUrl.replace(
        /^(https?:\/\/)(127\.0\.0\.1|localhost)/i,
        `$1${browserHost}`,
      );
    }
  }

  return configuredUrl || fallbackApiUrl;
}

// Đóng băng đối tượng cấu hình để đảm bảo không bị ghi đè ngoài ý muốn trong runtime
export const clientEnv = Object.freeze({
  apiUrl: resolveApiUrl(),
  maxFileSizeMb: parsePositiveInteger(
    import.meta.env.VITE_MAX_FILE_SIZE_MB,
    5,
  ),
  maxFilesPerTicket: parsePositiveInteger(
    import.meta.env.VITE_MAX_FILES_PER_TICKET,
    5,
  ),
});
