import { useQuery } from "@tanstack/react-query";
import { getUserDashboard } from "../services/dashboardService.js";

function useUserDashboard() {
  const { data, error, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["dashboard", "user"],
    queryFn: ({ signal }) => getUserDashboard({ signal }),
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

export default useUserDashboard;
