import { useQuery } from "@tanstack/react-query";
import { getActiveCategories } from "../services/categoryService.js";

function useActiveCategories() {
  const { data, error, isLoading, refetch } = useQuery({
    queryKey: ["categories", "active"],
    queryFn: ({ signal }) => getActiveCategories({ signal }),
  });

  return {
    categories: data ?? [],
    error: error ?? null,
    isLoading,
    refetch,
  };
}

export default useActiveCategories;
