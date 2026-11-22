import { create } from "zustand";
import { queryClient } from "../lib/queryClient.js";
import { login as requestLogin } from "../services/authService.js";
import { getCurrentUser } from "../services/userService.js";
import {
  clearAuthSession,
  getStoredAuthSession,
  saveAuthSession,
  updateStoredUser,
} from "../utils/authStorage.js";

function getInitialAuthState() {
  const storedSession = getStoredAuthSession();
  return {
    user: storedSession?.user ?? null,
    isAuthenticated: Boolean(storedSession?.user),
    isLoading: Boolean(storedSession),
  };
}

export const useAuthStore = create((set) => ({
  ...getInitialAuthState(),

  initializeAuth: async () => {
    const storedSession = getStoredAuthSession();
    if (!storedSession) {
      set({ user: null, isAuthenticated: false, isLoading: false });
      return;
    }

    try {
      const user = await getCurrentUser();
      updateStoredUser(user);
      set({ user, isAuthenticated: true, isLoading: false });
    } catch (error) {
      const statusCode = error.response?.status;
      if (
        statusCode === 401 ||
        statusCode === 403 ||
        error.code === "INVALID_AUTH_RESPONSE" ||
        error.code === "INVALID_USER_RESPONSE"
      ) {
        clearAuthSession();
        set({ user: null, isAuthenticated: false, isLoading: false });
        return;
      }
      set({ user: storedSession.user, isAuthenticated: true, isLoading: false });
    }
  },

  login: async ({ email, password, rememberMe }) => {
    const authenticationData = await requestLogin({ email, password });
    saveAuthSession(authenticationData, rememberMe);
    set({
      user: authenticationData.user,
      isAuthenticated: true,
      isLoading: false,
    });
    return authenticationData.user;
  },

  logout: () => {
    clearAuthSession();
    queryClient.clear();
    set({ user: null, isAuthenticated: false, isLoading: false });
  },

  updateUserSession: (authenticationData) => {
    if (authenticationData?.user && authenticationData?.accessToken) {
      const storedSession = getStoredAuthSession();
      const rememberMe = storedSession?.rememberMe ?? false;
      saveAuthSession(authenticationData, rememberMe);
      set({
        user: authenticationData.user,
        isAuthenticated: true,
        isLoading: false,
      });
    } else if (authenticationData?.user) {
      updateStoredUser(authenticationData.user);
      set({
        user: authenticationData.user,
        isAuthenticated: true,
        isLoading: false,
      });
    }
  },
}));
