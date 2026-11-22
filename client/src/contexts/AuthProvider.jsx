import { useEffect } from "react";
import { AUTH_UNAUTHORIZED_EVENT } from "../api/axiosClient.js";
import { useAuthStore } from "../stores/useAuthStore.js";

function AuthProvider({ children }) {
  const initializeAuth = useAuthStore((state) => state.initializeAuth);
  const logout = useAuthStore((state) => state.logout);

  useEffect(() => {
    initializeAuth();
  }, [initializeAuth]);

  useEffect(() => {
    function handleUnauthorized() {
      logout();
    }

    window.addEventListener(AUTH_UNAUTHORIZED_EVENT, handleUnauthorized);
    return () => {
      window.removeEventListener(AUTH_UNAUTHORIZED_EVENT, handleUnauthorized);
    };
  }, [logout]);

  return children;
}

export default AuthProvider;
