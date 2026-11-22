import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  getTicketFilterOptions,
  getTicketList,
} from "../services/ticketService.js";

function useTicketList(query) {
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
    isRefreshing: Boolean(data) && isFetching,
    refetch,
  };
}

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
