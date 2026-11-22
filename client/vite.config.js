/**
 * Cấu hình Vite cho ứng dụng frontend IT Helpdesk (React + Tailwind CSS v4).
 * Vai trò: Khai báo plugin biên dịch JSX/React, tích hợp Tailwind CSS và cấu hình
 * máy chủ phát triển (dev server) cho phép truy cập từ các thiết bị khác trong mạng LAN.
 */
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  // Kích hoạt plugin React (HMR, Fast Refresh) và plugin Tailwind CSS v4
  plugins: [react(), tailwindcss()],
  server: {
    // Lắng nghe trên mọi giao diện mạng để test đa máy trạm / USB Agent trong LAN
    host: "0.0.0.0",
    // Cổng mặc định của Vite dev server
    port: 5173,
    // Bắt buộc dùng đúng cổng 5173, báo lỗi nếu cổng đã bị chiếm dụng
    strictPort: true,
  },
});
