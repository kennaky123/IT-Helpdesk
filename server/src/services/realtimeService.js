/**
 * @file realtimeService.js
 * @description Service quản lý kênh thông báo thời gian thực qua Server-Sent Events (SSE).
 * Vai trò Service: Quản lý danh sách các client đang đăng ký kết nối SSE (`subscribers`),
 * phát thông điệp thay đổi dữ liệu (`data-changed`) tới toàn bộ client khi có biến động trong hệ thống
 * và duy trì nhịp tim (heartbeat) chống ngắt kết nối qua proxy/trình duyệt.
 */

// Tập hợp lưu trữ các đối tượng HTTP Response của client đang mở kết nối SSE
const subscribers = new Set();

/**
 * Phát sự kiện SSE `data-changed` tới toàn bộ client đang kết nối khi tài nguyên thay đổi.
 *
 * @param {string} [resource="system"] - Tên loại tài nguyên thay đổi (ví dụ: `"users"`, `"assets"`, `"software"`, `"usb"`).
 * @param {Object} [extra={}] - Dữ liệu bổ sung đính kèm vào payload sự kiện (ví dụ: `usbAlert`).
 * @returns {void}
 */
export function publishDataChanged(resource = "system", extra = {}) {
  const payload = JSON.stringify({
    resource,
    occurredAt: new Date().toISOString(),
    ...extra,
  });
  // Gửi khung sự kiện chuẩn SSE (event + data + hai dấu xuống dòng) cho từng subscriber
  for (const response of subscribers) {
    response.write(`event: data-changed\ndata: ${payload}\n\n`);
  }
}

/**
 * Đăng ký kết nối HTTP của client vào luồng SSE và tự động dọn dẹp tài nguyên khi client đóng kết nối.
 *
 * @param {import("express").Request} request - HTTP request dùng để lắng nghe sự kiện `close`.
 * @param {import("express").Response} response - HTTP response được giữ mở để stream dữ liệu SSE.
 * @returns {void}
 */
export function subscribeToRealtimeEvents(request, response) {
  // Thiết lập các header bắt buộc cho luồng SSE và tắt buffering ở reverse proxy (Nginx)
  response.status(200);
  response.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "private, no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  response.flushHeaders();

  // Gửi sự kiện xác nhận kết nối thành công và thêm client vào tập quản lý
  response.write(`event: connected\ndata: {"connected":true}\n\n`);
  subscribers.add(response);

  // Gửi comment SSE `: heartbeat` mỗi 25 giây để giữ kết nối không bị idle timeout
  const heartbeat = setInterval(() => response.write(": heartbeat\n\n"), 25_000);
  request.on("close", () => {
    clearInterval(heartbeat);
    subscribers.delete(response);
  });
}
