/**
 * @file useActiveTechnicians.js
 * @description Custom Hook truy vấn danh sách kỹ thuật viên (technicians) đang hoạt động.
 * Vai trò trong kiến trúc Frontend: Thuộc tầng Custom Hooks, cung cấp dữ liệu nhân sự kỹ thuật
 * cho form tạo/phân công ticket và bộ lọc, quản lý trạng thái tải qua React Query.
 */
import { useQuery } from "@tanstack/react-query";
import { getActiveTechnicians } from "../services/userService.js";

/**
 * Lấy danh sách kỹ thuật viên đang hoạt động, hỗ trợ bật/tắt truy vấn có điều kiện.
 *
 * Cơ chế cache React Query:
 * - Sử dụng queryKey ["technicians", "active"] để lưu cache dùng chung.
 * - Chỉ kích hoạt gọi API khi tham số `enabled` mang giá trị truthy.
 * - Tự động đồng bộ lại khi SSE thông báo thay đổi resource "users" hoặc "admin".
 *
 * @param {boolean} [enabled=true] - Cờ cho phép hoặc tạm hoãn việc gọi API (ví dụ chờ mở modal hoặc đủ quyền).
 * @returns {{
 *   technicians: Array<object>,
 *   error: Error | null,
 *   isLoading: boolean,
 *   refetch: Function
 * }} Danh sách kỹ thuật viên, lỗi (nếu có) và trạng thái loading thực tế.
 */
function useActiveTechnicians(enabled = true) {
  // Chỉ kích hoạt truy vấn khi tham số enabled hợp lệ và truyền AbortSignal cho axios
  const { data, error, isLoading, refetch } = useQuery({
    queryKey: ["technicians", "active"],
    queryFn: ({ signal }) => getActiveTechnicians({ signal }),
    enabled: Boolean(enabled),
  });

  return {
    technicians: data ?? [],
    error: error ?? null,
    // Tránh báo đang loading khi query đang bị vô hiệu hóa (enabled = false)
    isLoading: Boolean(enabled) && isLoading,
    refetch,
  };
}

export default useActiveTechnicians;
