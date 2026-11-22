/**
 * @file env.js
 * @description Nạp, chuẩn hóa và kiểm tra tính hợp lệ của toàn bộ biến môi trường hệ thống.
 * Vai trò trong kiến trúc Backend:
 * - Đọc file `.env` qua `dotenv` ngay khi module được import.
 * - Cung cấp đối tượng cấu hình bất biến `env` cho database, JWT, CORS, bcrypt và Multer upload.
 * - Cung cấp hàm `validateEnv()` chặn server khởi động nếu thiếu hoặc sai cấu hình quan trọng.
 */
import dotenv from "dotenv";

// Nạp biến môi trường từ file .env (tắt log thừa khi chạy bình thường hoặc test)
dotenv.config({ quiet: true });

/** Tập hợp các giá trị NODE_ENV được hệ thống hỗ trợ. */
const supportedNodeEnvironments = new Set([
  "development",
  "test",
  "production",
]);

/**
 * Phân tích một chuỗi biến môi trường thành số nguyên dương.
 * @param {string|undefined} value - Giá trị thô từ `process.env`.
 * @param {number} fallback - Giá trị mặc định sử dụng nếu `value` không hợp lệ hoặc `<= 0`.
 * @returns {number} Số nguyên dương đã parse hoặc giá trị `fallback`.
 */
function parsePositiveInteger(value, fallback) {
  const parsedValue = Number.parseInt(value, 10);
  return Number.isInteger(parsedValue) && parsedValue > 0
    ? parsedValue
    : fallback;
}

/**
 * Chuỗi kết nối database ưu tiên đọc từ `DATABASE_URL`,
 * hỗ trợ fallback sang `POSTGRES_URI` hoặc `MONGODB_URI` để tương thích cấu hình cũ.
 */
const resolvedDatabaseUrl =
  process.env.DATABASE_URL?.trim() ||
  process.env.POSTGRES_URI?.trim() ||
  process.env.MONGODB_URI?.trim() ||
  "";

/**
 * Đối tượng chứa toàn bộ cấu hình môi trường đã được chuẩn hóa và đóng băng (immutable).
 * Giúp mọi module truy xuất cấu hình nhất quán mà không bị ghi đè ngoài ý muốn lúc runtime.
 */
export const env = Object.freeze({
  nodeEnv: process.env.NODE_ENV ?? "development",
  host: process.env.HOST?.trim() || "0.0.0.0",
  port: parsePositiveInteger(process.env.PORT, 5000),
  databaseUrl: resolvedDatabaseUrl,
  mongoUri: resolvedDatabaseUrl,
  clientUrl: process.env.CLIENT_URL?.trim() || "http://127.0.0.1:5173",
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET?.trim() ?? "",
  jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN?.trim() || "365d",
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET?.trim() ?? "",
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN?.trim() || "7d",
  bcryptSaltRounds: parsePositiveInteger(process.env.BCRYPT_SALT_ROUNDS, 12),
  uploadDir: process.env.UPLOAD_DIR?.trim() || "uploads",
  maxFileSizeMb: parsePositiveInteger(process.env.MAX_FILE_SIZE_MB, 5),
  maxFilesPerTicket: parsePositiveInteger(
    process.env.MAX_FILES_PER_TICKET,
    5,
  ),
});

/**
 * Kiểm tra tính đầy đủ và hợp lệ của các biến môi trường bắt buộc trước khi chạy server.
 * Luồng xử lý:
 * 1. Kiểm tra `NODE_ENV` có nằm trong tập `supportedNodeEnvironments`.
 * 2. Kiểm tra sự tồn tại của `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`.
 * 3. Đảm bảo hai secret ký Access Token và Refresh Token không trùng nhau.
 * @throws {Error} Ném lỗi mô tả rõ biến môi trường bị thiếu hoặc sai cấu hình.
 * @returns {void}
 */
export function validateEnv() {
  if (!supportedNodeEnvironments.has(env.nodeEnv)) {
    throw new Error(
      "NODE_ENV phải là development, test hoặc production.",
    );
  }

  // Danh sách các biến cấu hình bắt buộc phải có giá trị trước khi khởi động API
  const requiredVariables = {
    DATABASE_URL: env.databaseUrl,
    JWT_ACCESS_SECRET: env.jwtAccessSecret,
    JWT_REFRESH_SECRET: env.jwtRefreshSecret,
  };

  const missingVariables = Object.entries(requiredVariables)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missingVariables.length > 0) {
    throw new Error(
      `Thiếu biến môi trường bắt buộc: ${missingVariables.join(", ")}.`,
    );
  }

  // Hai secret phải tách biệt để tránh dùng nhầm refresh token làm access token
  if (
    env.jwtAccessSecret &&
    env.jwtAccessSecret === env.jwtRefreshSecret
  ) {
    throw new Error("JWT_ACCESS_SECRET và JWT_REFRESH_SECRET phải khác nhau.");
  }
}
