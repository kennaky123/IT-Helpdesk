import { useQuery } from "@tanstack/react-query";
import { getTechnicianDashboard } from "../services/dashboardService.js";

function useTechnicianDashboard() {
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
