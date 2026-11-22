import { create } from "zustand";

const MAX_NOTIFICATIONS = 20;

export const useUiStore = create((set) => ({
  mobileMenuOpen: false,
  commandMenuOpen: false,
  notifications: [],

  openMobileMenu: () => set({ mobileMenuOpen: true }),
  closeMobileMenu: () => set({ mobileMenuOpen: false }),

  openCommandMenu: () => set({ commandMenuOpen: true }),
  closeCommandMenu: () => set({ commandMenuOpen: false }),
  toggleCommandMenu: () =>
    set((state) => ({ commandMenuOpen: !state.commandMenuOpen })),

  addNotification: (notification) =>
    set((state) => ({
      notifications: [
        {
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          read: false,
          createdAt: new Date().toISOString(),
          ...notification,
        },
        ...state.notifications,
      ].slice(0, MAX_NOTIFICATIONS),
    })),

  markAllNotificationsRead: () =>
    set((state) => ({
      notifications: state.notifications.map((item) => ({ ...item, read: true })),
    })),

  clearNotifications: () => set({ notifications: [] }),
}));
