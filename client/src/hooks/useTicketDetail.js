/**
 * @file useTicketDetail.js
 * @description Custom Hook tổng hợp toàn bộ dữ liệu cho trang chi tiết một Ticket.
 * Vai trò trong kiến trúc Frontend: Thuộc tầng Custom Hooks, điều phối song song 3 truy vấn
 * React Query (thông tin chi tiết, luồng bình luận/trao đổi và lịch sử thay đổi) theo `ticketId`.
 */
import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getTicketComments,
  getTicketDetail,
  getTicketHistory,
} from "../services/ticketService.js";

/**
 * Truy vấn chi tiết ticket, danh sách trao đổi và lịch sử xử lý cho một `ticketId`.
 *
 * Cơ chế cache React Query:
 * - Tách 3 query độc lập dưới chung prefix ["ticket", ticketId] để lỗi hoặc tải chậm ở phần
 *   comments/history không chặn việc hiển thị thông tin chính của ticket.
 * - Cả 3 query đều chỉ chạy khi `ticketId` hợp lệ (`enabled`) và tự động polling mỗi 15 giây.
 * - Hàm `refetch` invalidate prefix ["ticket", ticketId] để làm mới đồng thời cả 3 phần.
 *
 * @param {string | undefined} ticketId - ID của ticket cần xem chi tiết.
 * @returns {{
 *   ticket: object | null,
 *   ticketError: Error | null,
 *   comments: object | null,
 *   commentsError: Error | null,
 *   history: Array<object> | null,
 *   historyError: Error | null,
 *   isTicketLoading: boolean,
 *   isRefreshing: boolean,
 *   areCommentsLoading: boolean,
 *   isHistoryLoading: boolean,
 *   refetch: Function
 * }} Dữ liệu tổng hợp và trạng thái tải riêng biệt của từng khu vực chi tiết ticket.
 */
function useTicketDetail(ticketId) {
  const queryClient = useQueryClient();
  // Chỉ kích hoạt 3 truy vấn khi đã có ticketId hợp lệ từ route params
  const enabled = Boolean(ticketId);

  // Truy vấn thông tin chi tiết chính của ticket (chu kỳ polling 15 giây)
  const ticketQuery = useQuery({
    queryKey: ["ticket", ticketId, "detail"],
    queryFn: ({ signal }) => getTicketDetail(ticketId, { signal }),
    enabled,
    refetchInterval: 15_000,
  });

  // Truy vấn danh sách bình luận và ghi chú nội bộ của ticket
  const commentsQuery = useQuery({
    queryKey: ["ticket", ticketId, "comments"],
    queryFn: ({ signal }) => getTicketComments(ticketId, { signal }),
    enabled,
    refetchInterval: 15_000,
  });

  // Truy vấn nhật ký lịch sử chuyển trạng thái và phân công xử lý
  const historyQuery = useQuery({
    queryKey: ["ticket", ticketId, "history"],
    queryFn: ({ signal }) => getTicketHistory(ticketId, { signal }),
    enabled,
    refetchInterval: 15_000,
  });

  // Làm mới đồng bộ cả 3 cache con bằng cách invalidate chung prefix ["ticket", ticketId]
  const refetch = useCallback(() => {
    if (!ticketId) return Promise.resolve();
    return queryClient.invalidateQueries({ queryKey: ["ticket", ticketId] });
  }, [queryClient, ticketId]);

  return {
    ticket: ticketQuery.data ?? null,
    ticketError: ticketQuery.error ?? null,
    comments: commentsQuery.data ?? null,
    commentsError: commentsQuery.error ?? null,
    history: historyQuery.data ?? null,
    historyError: historyQuery.error ?? null,
    // Phân biệt trạng thái tải lần đầu (!data && isPending) với làm mới ngầm (isRefreshing)
    isTicketLoading: !ticketQuery.data && ticketQuery.isPending,
    isRefreshing:
      Boolean(ticketQuery.data) &&
      (ticketQuery.isFetching ||
        commentsQuery.isFetching ||
        historyQuery.isFetching),
    areCommentsLoading: !commentsQuery.data && commentsQuery.isPending,
    isHistoryLoading: !historyQuery.data && historyQuery.isPending,
    refetch,
  };
}

export default useTicketDetail;
