import { useAuthStore } from "../stores/useAuthStore.js";

function useAuth() {
  return useAuthStore();
}

export default useAuth;
