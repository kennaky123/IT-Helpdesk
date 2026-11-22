/**
 * @file useTechnicianDashboard.js
 * @description Custom Hook tải dữ liệu bảng điều khiển dành cho Kỹ thuật viên (Technician Dashboard).
 * Vai trò trong kiến trúc Frontend: Thuộc tầng Custom Hooks, kết nối giao diện công việc của kỹ thuật viên
 * với dashboardService và quản lý cache tự động làm mới bằng React Query.
 */
import { useQuery } from "@tanstack/react-query";
import { getTechnicianDashboard } from "../services/dashboardService.js";

/**
 * Truy vấn số liệu KPI cá nhân và danh sách ticket cần xử lý của kỹ thuật viên hiện tại.
 *
 * Cơ chế cache React Query:
 * - Lưu cache tại queryKey ["dashboard", "technician"].
 * - Tự động polling mỗi 30 giây (refetchInterval: 30_000) và được làm mới tức thì khi nhận SSE liên quan.
 *
 * @returns {{
 *   data: object | null,
 *   error: Error | null,
 *   isLoading: boolean,
 *   refetch: Function
 * }} Dữ liệu dashboard kỹ thuật viên và trạng thái truy vấn.
 */
function useTechnicianDashboard() {
  // Dùng polling 30 giây để cập nhật tiến độ và ticket mới được phân công
  const { data, error, isLoading, refetch } = useQuery({
    queryKey: ["dashboard", "technician"],
    queryFn: ({ signal }) => getTechnicianDashboard({ signal }),
    refetchInterval: 30_000,
  });

  return {
    data: data ?? null,
    error: error ?? null,
    isLoading,
    refetch,
  };
}

export default useTechnicianDashboard;
