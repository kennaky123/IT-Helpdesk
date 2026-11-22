import { useQuery } from "@tanstack/react-query";
import { getActiveTechnicians } from "../services/userService.js";

function useActiveTechnicians(enabled = true) {
  const { data, error, isLoading, refetch } = useQuery({
    queryKey: ["technicians", "active"],
    queryFn: ({ signal }) => getActiveTechnicians({ signal }),
    enabled: Boolean(enabled),
  });

  return {
    technicians: data ?? [],
    error: error ?? null,
    isLoading: Boolean(enabled) && isLoading,
    refetch,
  };
}

export default useActiveTechnicians;
