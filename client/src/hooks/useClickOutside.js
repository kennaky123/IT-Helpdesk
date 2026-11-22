/**
 * @file useClickOutside.js
 * @description Custom Hook phát hiện thao tác nhấn chuột hoặc chạm ra ngoài vùng phần tử DOM mục tiêu.
 * Vai trò trong kiến trúc Frontend: Thuộc tầng Custom Hooks, phục vụ đóng tự động các thành phần
 * nổi trên giao diện như dropdown, popover, menu người dùng hoặc hộp thoại.
 */
import { useEffect } from "react";

/**
 * Lắng nghe sự kiện pointer bên ngoài phần tử `ref` và thực thi callback `onClickOutside`.
 *
 * @param {React.RefObject<HTMLElement>} ref - Ref trỏ tới phần tử DOM cần bảo vệ khỏi click bên ngoài.
 * @param {Function} onClickOutside - Hàm callback được gọi khi người dùng nhấn ra ngoài phần tử.
 * @param {boolean} [enabled=true] - Cờ bật/tắt listener (nên truyền trạng thái mở menu để tránh lắng nghe thừa).
 * @returns {void}
 */
function useClickOutside(ref, onClickOutside, enabled = true) {
  useEffect(() => {
    // Không đăng ký event listener khi menu/popover đang đóng (enabled = false)
    if (!enabled) {
      return undefined;
    }

    function handlePointerDown(event) {
      // Kiểm tra ref hợp lệ và phần tử thực sự đang hiển thị trên layout;
      // getClientRects().length === 0 giúp bỏ qua phần tử bị ẩn (display: none) hoặc chưa render vào DOM
      if (!ref.current || ref.current.getClientRects().length === 0) {
        return;
      }

      // Chỉ kích hoạt callback khi điểm nhấn nằm hoàn toàn ngoài cây DOM của ref.current
      if (!ref.current.contains(event.target)) {
        onClickOutside();
      }
    }

    // Dùng pointerdown để phản hồi tức thì cho cả chuột và màn hình cảm ứng trước sự kiện click
    document.addEventListener("pointerdown", handlePointerDown);

    // Gỡ bỏ listener khi component unmount hoặc các dependency thay đổi
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [enabled, onClickOutside, ref]);
}

export default useClickOutside;
