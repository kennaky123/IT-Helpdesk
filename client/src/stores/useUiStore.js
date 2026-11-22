/**
 * @file useUiStore.js
 * @description Zustand Store quản lý trạng thái giao diện dùng chung toàn cục (menu di động, bảng lệnh nhanh và thông báo).
 * Vai trò trong kiến trúc Frontend: Thuộc tầng Zustand Stores, lưu giữ UI state xuyên suốt các trang
 * mà không phụ thuộc vào React Context lồng nhau; đồng thời cho phép `useRealtimeUpdates` đẩy thông báo trực tiếp.
 */
import { create } from "zustand";

// Giới hạn số lượng thông báo tối đa lưu trong bộ nhớ để tránh phình state khi nhận nhiều SSE
const MAX_NOTIFICATIONS = 20;

/**
 * Zustand store điều khiển các trạng thái giao diện toàn cục và trung tâm thông báo.
 *
 * State:
 * - `mobileMenuOpen`: Trạng thái đóng/mở thanh điều hướng trên màn hình nhỏ.
 * - `commandMenuOpen`: Trạng thái đóng/mở hộp thoại tìm kiếm/lệnh nhanh (Command Menu).
 * - `notifications`: Mảng thông báo thời gian thực (mới nhất đứng đầu, tối đa 20 mục).
 */
export const useUiStore = create((set) => ({
  mobileMenuOpen: false,
  commandMenuOpen: false,
  notifications: [],

  /**
   * Mở ngăn menu điều hướng trên thiết bị di động.
   * @returns {void}
   */
  openMobileMenu: () => set({ mobileMenuOpen: true }),

  /**
   * Đóng ngăn menu điều hướng trên thiết bị di động.
   * @returns {void}
   */
  closeMobileMenu: () => set({ mobileMenuOpen: false }),

  /**
   * Mở bảng lệnh nhanh (Command Menu).
   * @returns {void}
   */
  openCommandMenu: () => set({ commandMenuOpen: true }),

  /**
   * Đóng bảng lệnh nhanh (Command Menu).
   * @returns {void}
   */
  closeCommandMenu: () => set({ commandMenuOpen: false }),

  /**
   * Đảo ngược trạng thái đóng/mở của bảng lệnh nhanh.
   * @returns {void}
   */
  toggleCommandMenu: () =>
    set((state) => ({ commandMenuOpen: !state.commandMenuOpen })),

  /**
   * Thêm một thông báo mới vào đầu danh sách, tự sinh ID, gắn thời gian tạo và giới hạn tối đa 20 mục.
   *
   * @param {{ title: string, message: string, level?: "info" | "success" | "warning" | "error" }} notification - Nội dung thông báo.
   * @returns {void}
   */
  addNotification: (notification) =>
    set((state) => ({
      notifications: [
        // Sinh id duy nhất kết hợp timestamp + chuỗi ngẫu nhiên và đặt trạng thái chưa đọc
        {
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          read: false,
          createdAt: new Date().toISOString(),
          ...notification,
        },
        ...state.notifications,
      ].slice(0, MAX_NOTIFICATIONS),
    })),

  /**
   * Đánh dấu toàn bộ thông báo hiện có trong danh sách là đã đọc (`read: true`).
   * @returns {void}
   */
  markAllNotificationsRead: () =>
    set((state) => ({
      notifications: state.notifications.map((item) => ({ ...item, read: true })),
    })),

  /**
   * Xóa toàn bộ thông báo hiện có khỏi danh sách.
   * @returns {void}
   */
  clearNotifications: () => set({ notifications: [] }),
}));
