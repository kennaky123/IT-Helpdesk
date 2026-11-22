/**
 * @file useTicketList.js
 * @description Custom Hooks truy vấn danh sách ticket có lọc/phân trang và dữ liệu tùy chọn bộ lọc.
 * Vai trò trong kiến trúc Frontend: Thuộc tầng Custom Hooks, kết nối trang danh sách ticket
 * với `ticketService` thông qua React Query, tối ưu chuyển trang mượt mà không nháy giao diện.
 */
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  getTicketFilterOptions,
  getTicketList,
} from "../services/ticketService.js";

/**
 * Truy vấn danh sách ticket theo bộ lọc, sắp xếp và phân trang.
 *
 * Cơ chế cache React Query:
 * - Cache riêng biệt cho từng tổ hợp tham số `query` tại key ["tickets", "list", query].
 * - Bật `placeholderData: keepPreviousData` để giữ hiển thị dữ liệu cũ trong khi đang fetch trang/bộ lọc mới.
 * - Polling định kỳ mỗi 30 giây và tự đồng bộ khi có sự kiện SSE "tickets".
 *
 * @param {object} query - Đối tượng tham số truy vấn đã chuẩn hóa từ `useTicketListQuery`.
 * @returns {{
 *   data: object | null,
 *   error: Error | null,
 *   isLoading: boolean,
 *   isRefreshing: boolean,
 *   refetch: Function
 * }} Dữ liệu `{ tickets, pagination }`, lỗi và cờ trạng thái tải.
 */
function useTicketList(query) {
  // Giữ lại dữ liệu trước đó (keepPreviousData) giúp chuyển trang hoặc đổi bộ lọc mượt mà
  const { data, error, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["tickets", "list", query],
    queryFn: ({ signal }) => getTicketList(query, { signal }),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  });

  return {
    data: data ?? null,
    error: error ?? null,
    isLoading,
    // Chỉ bật isRefreshing khi đang tải ngầm dữ liệu mới trên nền dữ liệu đã có
    isRefreshing: Boolean(data) && isFetching,
    refetch,
  };
}

/**
 * Truy vấn danh sách danh mục và kỹ thuật viên phục vụ các ô chọn lọc danh sách ticket.
 *
 * Cơ chế cache React Query:
 * - Lưu cache tại queryKey ["tickets", "filter-options"].
 * - Được invalidate tự động qua SSE khi dữ liệu `categories`, `users` hoặc `admin` thay đổi.
 *
 * @returns {{
 *   data: { categories: Array<object>, technicians: Array<object> } | null,
 *   error: Error | null,
 *   isLoading: boolean,
 *   refetch: Function
 * }} Tùy chọn bộ lọc và trạng thái truy vấn.
 */
export function useTicketFilterOptions() {
  const { data, error, isLoading, refetch } = useQuery({
    queryKey: ["tickets", "filter-options"],
    queryFn: ({ signal }) => getTicketFilterOptions({ signal }),
  });

  return {
    data: data ?? null,
    error: error ?? null,
    isLoading,
    refetch,
  };
}

export default useTicketList;
