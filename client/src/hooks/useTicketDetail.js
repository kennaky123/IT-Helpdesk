import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getTicketComments,
  getTicketDetail,
  getTicketHistory,
} from "../services/ticketService.js";

function useTicketDetail(ticketId) {
  const queryClient = useQueryClient();
  const enabled = Boolean(ticketId);

  const ticketQuery = useQuery({
    queryKey: ["ticket", ticketId, "detail"],
    queryFn: ({ signal }) => getTicketDetail(ticketId, { signal }),
    enabled,
    refetchInterval: 15_000,
  });

  const commentsQuery = useQuery({
    queryKey: ["ticket", ticketId, "comments"],
    queryFn: ({ signal }) => getTicketComments(ticketId, { signal }),
    enabled,
    refetchInterval: 15_000,
  });

  const historyQuery = useQuery({
    queryKey: ["ticket", ticketId, "history"],
    queryFn: ({ signal }) => getTicketHistory(ticketId, { signal }),
    enabled,
    refetchInterval: 15_000,
  });

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
