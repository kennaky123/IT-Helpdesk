/**
 * @file server.js
 * @description Điểm khởi chạy chính (entry point) của IT Helpdesk Backend Server.
 * Vai trò trong kiến trúc Backend:
 * - Kiểm tra tính hợp lệ của các biến môi trường trước khi chạy.
 * - Thiết lập kết nối tới cơ sở dữ liệu PostgreSQL và khởi tạo schema nếu cần.
 * - Mở cổng HTTP Server để lắng nghe request và hiển thị các địa chỉ mạng LAN khả dụng.
 * - Xử lý dừng tiến trình an toàn (graceful shutdown) khi nhận tín hiệu SIGINT hoặc SIGTERM.
 */
import os from "node:os";
import app from "./app.js";
import {
  connectDatabase,
  disconnectDatabase,
} from "./config/database.js";
import { env, validateEnv } from "./config/env.js";

/** Lưu tham chiếu tới HTTP server đang lắng nghe để đóng kết nối khi shutdown. */
let httpServer;
/** Cờ chống thực thi trùng lặp quá trình tắt server khi nhận nhiều tín hiệu liên tiếp. */
let isShuttingDown = false;

/**
 * Lấy danh sách địa chỉ IPv4 nội bộ trên các card mạng của máy chủ.
 * Nhiệm vụ: Hỗ trợ quản trị viên biết chính xác địa chỉ truy cập API từ các máy khác trong mạng LAN.
 * Luồng xử lý: Duyệt `os.networkInterfaces()`, lọc các interface IPv4 không phải loopback (`!internal`)
 * và bỏ qua dải địa chỉ tự cấp lỗi link-local (`169.254.x.x`).
 * @returns {Array<{name: string, address: string}>} Danh sách tên card mạng và địa chỉ IPv4 tương ứng.
 */
function getLanAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const [name, nets] of Object.entries(interfaces)) {
    for (const net of nets || []) {
      // Chỉ giữ IPv4 ngoài loopback và không thuộc dải APIPA (169.254.0.0/16)
      if (net.family === "IPv4" && !net.internal && !net.address.startsWith("169.254.")) {
        addresses.push({ name, address: net.address });
      }
    }
  }
  return addresses;
}

/**
 * Khởi động HTTP Server của Express theo cơ chế Promise.
 * Nhiệm vụ: Mở cổng `env.port` trên `env.host` và chờ sự kiện `listening` hoặc `error`.
 * Luồng xử lý: Gắn listener một lần cho `error` và `listening`; khi server lắng nghe thành công thì gỡ
 * listener lỗi cũ để tránh rò rỉ bộ nhớ và resolve instance `http.Server`.
 * @returns {Promise<import("node:http").Server>} Promise trả về đối tượng HTTP server đã sẵn sàng.
 */
function listenForRequests() {
  return new Promise((resolve, reject) => {
    const server = app.listen(env.port, env.host);
    const handleError = (error) => reject(error);

    server.once("error", handleError);
    server.once("listening", () => {
      // Gỡ handler lỗi khởi động sau khi server đã mở cổng thành công
      server.off("error", handleError);
      resolve(server);
    });
  });
}

/**
 * Hàm điều phối toàn bộ quy trình khởi động Backend Server.
 * Luồng xử lý:
 * 1. Gọi `validateEnv()` kiểm tra biến môi trường bắt buộc.
 * 2. Gọi `connectDatabase()` kết nối PostgreSQL và đảm bảo bảng/index đã sẵn sàng.
 * 3. Gọi `listenForRequests()` mở cổng API và in địa chỉ local cùng các địa chỉ LAN.
 * 4. Nếu thất bại ở bất kỳ bước nào, thử ngắt kết nối database và thoát tiến trình với mã lỗi 1.
 * @returns {Promise<void>}
 */
async function startServer() {
  try {
    validateEnv();
    await connectDatabase();
    httpServer = await listenForRequests();

    console.log(`IT Helpdesk API đang chạy tại http://${env.host}:${env.port}`);
    // Hiển thị các địa chỉ IP LAN giúp client và USB Agent kết nối thuận tiện
    const lanList = getLanAddresses();
    for (const item of lanList) {
      console.log(`  ➜ Mạng LAN (${item.name}): http://${item.address}:${env.port}`);
    }
  } catch (error) {
    console.error(`Không thể khởi động server: ${error.message}`);

    // Đảm bảo dọn dẹp kết nối DB nếu lỗi xảy ra sau khi đã kết nối PostgreSQL
    try {
      await disconnectDatabase();
    } catch (disconnectError) {
      console.error(disconnectError.message);
    }

    process.exit(1);
  }
}

/**
 * Thực hiện dừng server an toàn (Graceful Shutdown) khi nhận tín hiệu từ hệ điều hành.
 * @param {string} signal - Tên tín hiệu dừng (ví dụ: `"SIGINT"`, `"SIGTERM"`).
 * @param {number} [exitCode=0] - Mã thoát tiến trình sau khi dọn dẹp xong.
 * @returns {Promise<void>}
 */
async function shutdown(signal, exitCode = 0) {
  // Ngăn chặn gọi shutdown nhiều lần nếu người dùng bấm Ctrl+C liên tiếp
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;

  try {
    console.log(`${signal} được nhận. Đang dừng server...`);

    // Đóng HTTP server để hoàn tất các request đang xử lý trước khi thoát
    if (httpServer?.listening) {
      await new Promise((resolve, reject) => {
        httpServer.close((error) => (error ? reject(error) : resolve()));
      });
    }

    // Đóng toàn bộ connection pool PostgreSQL trước khi kết thúc process
    await disconnectDatabase();
    process.exit(exitCode);
  } catch (error) {
    console.error(`Không thể dừng server an toàn: ${error.message}`);
    process.exit(1);
  }
}

// Lắng nghe tín hiệu ngắt tiến trình từ terminal (Ctrl+C) hoặc trình quản lý tiến trình (Docker/PM2)
process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));

// Kích hoạt khởi động server ngay khi file được thực thi
startServer();
