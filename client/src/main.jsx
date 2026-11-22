/**
 * Điểm khởi chạy chính (Entry Point) của ứng dụng frontend IT Helpdesk.
 * Vai trò: Mount ứng dụng React vào phần tử DOM #root và bọc các Provider toàn cục
 * (React Query, React Router, AuthProvider, ToastContainer) cùng stylesheet chính.
 */
import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import App from "./App.jsx";
import AuthProvider from "./contexts/AuthProvider.jsx";
import "./index.css";
import { queryClient } from "./lib/queryClient.js";

// Khởi tạo React Root tại thẻ <div id="root"> trong index.html
createRoot(document.getElementById("root")).render(
  <StrictMode>
    {/* Cung cấp bộ nhớ đệm và quản lý server-state cho toàn bộ ứng dụng qua TanStack Query */}
    <QueryClientProvider client={queryClient}>
      {/* Kích hoạt điều hướng SPA dựa trên History API */}
      <BrowserRouter>
        {/* Khởi tạo phiên đăng nhập và lắng nghe sự kiện hết hạn token (401) */}
        <AuthProvider>
          <App />
          {/* Vùng hiển thị thông báo nổi (toast) toàn cục, dùng chung cho CRUD và cảnh báo USB realtime */}
          <ToastContainer
            position="top-right"
            autoClose={3000}
            newestOnTop
            closeOnClick
            pauseOnHover
          />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
