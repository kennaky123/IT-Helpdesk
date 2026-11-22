/**
 * @file useAdminDashboard.js
 * @description Custom Hook tải dữ liệu tổng hợp cho bảng điều khiển Quản trị viên (Admin Dashboard).
 * Vai trò trong kiến trúc Frontend: Thuộc tầng Custom Hooks, kết nối Dashboard UI với dashboardService,
 * quản lý cơ chế polling định kỳ và làm mới ngầm qua React Query.
 */
import { useQuery } from "@tanstack/react-query";
import { getAdminDashboard } from "../services/dashboardService.js";

/**
 * Truy vấn dữ liệu thống kê, biểu đồ và ticket mới nhất cho màn hình Admin Dashboard.
 *
 * Cơ chế cache React Query:
 * - Lưu cache tại queryKey ["dashboard", "admin"].
 * - Tự động polling gọi lại API mỗi 30 giây (refetchInterval: 30_000).
 * - Được invalidate tự động qua SSE khi có thay đổi tickets, users, admin, assets, software hoặc usb.
 *
 * @returns {{
 *   data: object | null,
 *   error: Error | null,
 *   isLoading: boolean,
 *   isRefreshing: boolean,
 *   refetch: Function
 * }} Dữ liệu dashboard và các cờ trạng thái tải/làm mới.
 */
function useAdminDashboard() {
  // Thiết lập polling 30 giây/lần để cập nhật số liệu tổng quan liên tục
  const { data, error, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["dashboard", "admin"],
    queryFn: ({ signal }) => getAdminDashboard({ signal }),
    refetchInterval: 30_000,
  });

  return {
    data: data ?? null,
    error: error ?? null,
    isLoading,
    // Chỉ bật isRefreshing khi đã có dữ liệu cũ hiển thị và đang fetch ngầm dữ liệu mới
    isRefreshing: Boolean(data) && isFetching,
    refetch,
  };
}

export default useAdminDashboard;
