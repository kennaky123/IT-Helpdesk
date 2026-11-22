/**
 * Cấu hình instance TanStack React Query dùng chung toàn ứng dụng.
 * Vai trò: Quản lý cơ chế cache dữ liệu API, làm mới khi người dùng quay lại tab trình duyệt
 * và giới hạn số lần thử lại khi request gặp lỗi mạng.
 */
import { QueryClient } from "@tanstack/react-query";

// Khởi tạo QueryClient với thiết lập mặc định cho mọi useQuery
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Dữ liệu được coi là "tươi" trong 10 giây trước khi tự động fetch lại ngầm
      staleTime: 10_000,
      // Tự động đồng bộ lại dữ liệu khi người dùng chuyển focus quay lại cửa sổ trình duyệt
      refetchOnWindowFocus: true,
      // Thử lại tối đa 1 lần nếu truy vấn gặp lỗi
      retry: 1,
    },
  },
});
