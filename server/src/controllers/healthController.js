/**
 * @file healthController.js
 * @description Controller kiểm tra trạng thái sống (Health Check) của máy chủ API IT Helpdesk.
 * Vai trò Controller: Tiếp nhận HTTP GET request kiểm tra hệ thống, thu thập thời điểm hiện tại
 * và thời gian hoạt động (`uptime`) của tiến trình Node.js để trả về HTTP 200 cho bộ giám sát/load balancer.
 */

/**
 * Kiểm tra và trả về tình trạng hoạt động hiện tại của dịch vụ backend.
 *
 * @param {import("express").Request} _request - HTTP request (không sử dụng tham số đầu vào).
 * @param {import("express").Response} response - HTTP response trả về thông tin trạng thái server.
 * @param {import("express").NextFunction} next - Middleware chuyển tiếp lỗi.
 * @returns {import("express").Response|void} JSON response HTTP 200 chứa `service`, `status`, `timestamp`, `uptime`.
 */
export function getHealth(_request, response, next) {
  try {
    // Trả về trạng thái sẵn sàng kèm thời gian chạy liên tục (giây, làm tròn 2 chữ số)
    return response.status(200).json({
      success: true,
      message: "IT Helpdesk API đang hoạt động.",
      data: {
        service: "it-helpdesk-server",
        status: "ok",
        timestamp: new Date().toISOString(),
        uptime: Number(process.uptime().toFixed(2)),
      },
    });
  } catch (error) {
    return next(error);
  }
}
