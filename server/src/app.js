/**
 * @file app.js
 * @description Khởi tạo và cấu hình ứng dụng Express chính của hệ thống IT Helpdesk Backend.
 * Vai trò trong kiến trúc Backend:
 * - Thiết lập các middleware bảo mật, CORS (hỗ trợ mạng LAN nội bộ) và phân tích body request.
 * - Gắn bộ theo dõi phản hồi API để phát sự kiện cập nhật dữ liệu thời gian thực (SSE broadcast).
 * - Điều phối toàn bộ route dưới tiền tố `/api` và xử lý 404 / lỗi tập trung ở cuối pipeline.
 */
import cors from "cors";
import express from "express";
import { env } from "./config/env.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { notFound } from "./middleware/notFound.js";
import apiRouter from "./routes/index.js";
import { publishDataChanged } from "./services/realtimeService.js";

/** Instance ứng dụng Express trung tâm được export cho server.js và các bài kiểm thử. */
const app = express();

/**
 * Biểu thức chính quy nhận diện các origin hợp lệ trong mạng nội bộ (LAN).
 * Cho phép localhost, 127.0.0.1 và các dải IP private RFC 1918 (192.168.x.x, 10.x.x.x, 172.16-31.x.x).
 */
const LAN_ORIGIN_REGEX =
  /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})(:\d+)?$/i;

// Vô hiệu hóa header X-Powered-By để hạn chế lộ thông tin framework Express
app.disable("x-powered-by");

// Cấu hình CORS cho phép frontend chính thức, các máy trạm trong mạng LAN và agent gửi dữ liệu kèm cookie/credentials
app.use(
  cors({
    /**
     * Hàm kiểm tra và phản hồi Access-Control-Allow-Origin động theo từng request.
     * @param {string|undefined} requestOrigin - Giá trị header Origin do trình duyệt gửi lên.
     * @param {Function} callback - Hàm callback của thư viện cors (err, allowedOrigin).
     */
    origin(requestOrigin, callback) {
      // Cho phép các request không mang Origin (ví dụ: curl, Postman, USB Agent trên Windows)
      if (!requestOrigin) {
        return callback(null, env.clientUrl);
      }
      // Chấp nhận nếu origin trùng với CLIENT_URL cấu hình hoặc thuộc dải địa chỉ mạng LAN nội bộ
      if (
        requestOrigin === env.clientUrl ||
        LAN_ORIGIN_REGEX.test(requestOrigin)
      ) {
        return callback(null, requestOrigin);
      }
      // Fallback về CLIENT_URL mặc định cho các origin ngoài danh sách LAN
      return callback(null, env.clientUrl);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Agent-Key"],
  }),
);

// Phân tích payload JSON và URL-encoded với giới hạn 1MB để bảo vệ bộ nhớ server
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

/**
 * Nhóm toàn bộ API dưới đường dẫn `/api`, đồng thời tích hợp middleware phát sự kiện SSE.
 * Khi một request ghi dữ liệu (POST/PUT/PATCH/DELETE) hoàn tất thành công (< 400),
 * hệ thống tự động trích xuất tên tài nguyên và gọi `publishDataChanged` để các client đồng bộ giao diện.
 */
app.use(
  "/api",
  (request, response, next) => {
    response.on("finish", () => {
      // Chỉ broadcast SSE khi thao tác thay đổi dữ liệu thành công (HTTP status < 400)
      if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method) && response.statusCode < 400) {
        // Lấy tên resource chính từ URL (bỏ qua tiền tố "api", ví dụ: /api/tickets/123 -> "tickets")
        const pathParts = request.originalUrl.split("?")[0].split("/").filter(Boolean);
        const resource = pathParts[0] === "api" ? pathParts[1] : pathParts[0];
        publishDataChanged(resource);
      }
    });
    next();
  },
  apiRouter,
);

// Bắt các route không khớp (404) và chuyển qua middleware xử lý lỗi tập trung
app.use(notFound);
app.use(errorHandler);

export default app;
