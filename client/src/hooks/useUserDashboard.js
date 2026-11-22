/**
 * @file useUserDashboard.js
 * @description Custom Hook tải dữ liệu bảng điều khiển cá nhân cho Người dùng cuối (User Dashboard).
 * Vai trò trong kiến trúc Frontend: Thuộc tầng Custom Hooks, kết nối giao diện tổng quan cá nhân
 * với dashboardService và quản lý cache tự động đồng bộ qua React Query.
 */
import { useQuery } from "@tanstack/react-query";
import { getUserDashboard } from "../services/dashboardService.js";

/**
 * Truy vấn tóm tắt tình trạng các ticket do người dùng hiện tại tạo và danh sách ticket gần đây.
 *
 * Cơ chế cache React Query:
 * - Cache tại queryKey ["dashboard", "user"].
 * - Tự động polling mỗi 30 giây (refetchInterval: 30_000) và được làm mới khi SSE thông báo thay đổi ticket.
 *
 * @returns {{
 *   data: object | null,
 *   error: Error | null,
 *   isLoading: boolean,
 *   isRefreshing: boolean,
 *   refetch: Function
 * }} Dữ liệu dashboard người dùng và các cờ trạng thái tải.
 */
function useUserDashboard() {
  // Polling 30 giây/lần để cập nhật tiến độ xử lý các yêu cầu của người dùng
  const { data, error, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["dashboard", "user"],
    queryFn: ({ signal }) => getUserDashboard({ signal }),
    refetchInterval: 30_000,
  });

  return {
    data: data ?? null,
    error: error ?? null,
    isLoading,
    // Chỉ bật isRefreshing khi đang fetch ngầm lại trên nền dữ liệu cũ đã có
    isRefreshing: Boolean(data) && isFetching,
    refetch,
  };
}

export default useUserDashboard;
