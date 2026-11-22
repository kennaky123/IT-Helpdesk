import { useQuery } from "@tanstack/react-query";
import { getAdminDashboard } from "../services/dashboardService.js";

function useAdminDashboard() {
  const { data, error, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["dashboard", "admin"],
    queryFn: ({ signal }) => getAdminDashboard({ signal }),
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

export default useAdminDashboard;
