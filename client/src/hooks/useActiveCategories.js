/**
 * @file useActiveCategories.js
 * @description Custom Hook truy vấn danh sách danh mục sự cố (categories) đang hoạt động.
 * Vai trò trong kiến trúc Frontend: Thuộc tầng Custom Hooks, đóng vai trò cầu nối
 * giữa các UI component (form tạo ticket, bộ lọc) và categoryService thông qua React Query.
 */
import { useQuery } from "@tanstack/react-query";
import { getActiveCategories } from "../services/categoryService.js";

/**
 * Lấy và quản lý cache danh sách các danh mục sự cố đang được kích hoạt.
 *
 * Cơ chế cache React Query:
 * - Sử dụng queryKey ["categories", "active"] để chia sẻ cache giữa nhiều component.
 * - Truyền AbortSignal giúp tự động hủy request HTTP nếu component unmount giữa chừng.
 * - Dữ liệu cache được tự động làm mới (invalidate) khi nhận sự kiện SSE "categories" hoặc "admin".
 *
 * @returns {{
 *   categories: Array<{id: string, name: string, slug: string, description: string}>,
 *   error: Error | null,
 *   isLoading: boolean,
 *   refetch: Function
 * }} Trạng thái truy vấn và danh sách danh mục chuẩn hóa.
 */
function useActiveCategories() {
  // Gọi useQuery với key ["categories", "active"] và truyền signal để hủy request khi cần
  const { data, error, isLoading, refetch } = useQuery({
    queryKey: ["categories", "active"],
    queryFn: ({ signal }) => getActiveCategories({ signal }),
  });

  // Chuẩn hóa giá trị trả về mặc định nhằm tránh lỗi undefined ở tầng UI
  return {
    categories: data ?? [],
    error: error ?? null,
    isLoading,
    refetch,
  };
}

export default useActiveCategories;
