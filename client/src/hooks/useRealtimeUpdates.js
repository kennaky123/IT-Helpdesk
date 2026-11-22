/**
 * @file useRealtimeUpdates.js
 * @description Custom Hook thiết lập kênh nhận sự kiện thời gian thực (SSE) từ Backend.
 * Vai trò trong kiến trúc Frontend: Thuộc tầng Custom Hooks, chịu trách nhiệm duy trì luồng
 * Server-Sent Events (`/events`), tự động vô hiệu hóa (invalidate) cache React Query liên quan,
 * đẩy thông báo vào Zustand UI store và phát CustomEvent toàn cục trên `window`.
 */
import { useEffect } from "react";
import { clientEnv } from "../config/env.js";
import { queryClient } from "../lib/queryClient.js";
import { useUiStore } from "../stores/useUiStore.js";
import { getStoredAccessToken } from "../utils/authStorage.js";

/** Tên sự kiện DOM tùy chỉnh được phát lên `window` mỗi khi có thay đổi dữ liệu qua SSE. */
export const REALTIME_DATA_EVENT = "it-helpdesk:data-changed";

/**
 * Bảng ánh xạ từ tên resource phía server sang các prefix `queryKey` của React Query cần làm mới.
 * Khi một resource thay đổi, tất cả màn hình đang dùng các queryKey tương ứng sẽ tự động refetch.
 */
const RESOURCE_QUERY_PREFIXES = {
  tickets: [["tickets"], ["ticket"], ["dashboard"]],
  categories: [["categories"], ["tickets", "filter-options"]],
  users: [["technicians"], ["admin", "users"], ["tickets", "filter-options"], ["dashboard"]],
  admin: [["admin"], ["categories"], ["technicians"], ["tickets", "filter-options"], ["dashboard"]],
  assets: [["assets"], ["software"], ["dashboard"]],
  software: [["software"], ["dashboard"]],
  usb: [["usb"], ["dashboard"]],
};

/**
 * Vô hiệu hóa (invalidate) các React Query cache tương ứng với loại tài nguyên vừa thay đổi.
 *
 * @param {string} resource - Tên tài nguyên nhận từ sự kiện SSE (vd: "tickets", "assets", "usb").
 * @returns {void}
 */
function invalidateResourceQueries(resource) {
  const prefixes = RESOURCE_QUERY_PREFIXES[resource];
  // Nếu không có cấu hình cụ thể cho resource thì invalidate toàn bộ cache để đảm bảo đồng bộ
  if (!prefixes) {
    queryClient.invalidateQueries();
    return;
  }
  // Invalidate lần lượt từng prefix queryKey liên quan tới resource
  prefixes.forEach((queryKey) => {
    queryClient.invalidateQueries({ queryKey });
  });
}

/**
 * Tạo thông báo hiển thị trên UI dựa trên nội dung sự kiện SSE và đẩy vào Zustand `useUiStore`.
 *
 * @param {object} detail - Payload JSON phân tích được từ khối dữ liệu SSE.
 * @returns {void}
 */
function pushRealtimeNotification(detail) {
  // Lấy action trực tiếp từ store ngoài React render cycle bằng getState()
  const { addNotification } = useUiStore.getState();

  // Ưu tiên xử lý thông báo chi tiết cho các sự kiện giám sát cắm/rút USB
  if (detail.usbAlert) {
    const alert = detail.usbAlert;
    const hostText = `${alert.hostname}${alert.osUsername ? ` (${alert.osUsername})` : ""}`;
    // Xác định mức độ cảnh báo theo chính sách thiết bị USB
    const level =
      alert.status === "blocked"
        ? "error"
        : alert.status === "unverified"
          ? "warning"
          : "info";

    addNotification({
      title:
        alert.eventType === "disconnected"
          ? `Ngắt kết nối USB trên ${alert.hostname}`
          : `Sự kiện USB (${alert.status})`,
      message: `${hostText}: ${alert.deviceName}${alert.driveLetter ? ` [Ổ ${alert.driveLetter}]` : ""}`,
      level,
    });
    return;
  }

  // Thông báo mặc định theo từng nhóm resource hệ thống
  const staticNotices = {
    tickets: {
      title: "Cập nhật ticket",
      message: "Dữ liệu yêu cầu hỗ trợ vừa được đồng bộ.",
      level: "info",
    },
    assets: {
      title: "Cập nhật tài sản CMDB",
      message: "Thông tin thiết bị vừa có thay đổi.",
      level: "info",
    },
    software: {
      title: "Cập nhật phần mềm & license",
      message: "Danh mục phần mềm bản quyền vừa được cập nhật.",
      level: "info",
    },
    admin: {
      title: "Cập nhật quản trị hệ thống",
      message: "Người dùng, danh mục hoặc kỹ thuật viên vừa thay đổi.",
      level: "success",
    },
  };

  if (staticNotices[detail.resource]) {
    addNotification(staticNotices[detail.resource]);
  }
}

/**
 * Phân tích một khối thông điệp SSE hoàn chỉnh (phân cách bởi "\n\n") và điều phối cập nhật.
 *
 * @param {string} block - Chuỗi text của một event SSE thô.
 * @returns {void}
 */
function dispatchSseBlock(block) {
  const lines = block.split("\n");
  // Trích xuất tên sự kiện từ dòng bắt đầu bằng "event:"
  const eventName = lines.find((line) => line.startsWith("event:"))?.slice(6).trim();
  // Chỉ xử lý sự kiện nghiệp vụ "data-changed", bỏ qua heartbeat hoặc event khác
  if (eventName !== "data-changed") return;
  // Gom các dòng "data:" (hỗ trợ payload nhiều dòng theo chuẩn SSE)
  const data = lines.filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("\n");
  let detail;
  // Bỏ qua an toàn nếu dữ liệu JSON bị lỗi hoặc không hoàn chỉnh
  try { detail = JSON.parse(data); } catch { return; }

  // Đồng bộ dữ liệu: làm mới React Query cache, đẩy toast/notification và phát CustomEvent cho các listener khác
  invalidateResourceQueries(detail.resource);
  pushRealtimeNotification(detail);
  window.dispatchEvent(new CustomEvent(REALTIME_DATA_EVENT, { detail }));
}

/**
 * Khởi tạo kết nối SSE dài hạn tới endpoint `/events` khi người dùng đã đăng nhập.
 *
 * Cơ chế hoạt động:
 * - Sử dụng `fetch` stream kết hợp `ReadableStream` thay cho `EventSource` mặc định
 *   nhằm đính kèm header `Authorization: Bearer <token>`.
 * - Tự động thử kết nối lại sau mỗi 3 giây nếu stream bị ngắt ngoài ý muốn.
 * - Tự động hủy kết nối và dọn timer khi component chứa hook unmount.
 *
 * @returns {void}
 */
function useRealtimeUpdates() {
  useEffect(() => {
    const controller = new AbortController();
    let reconnectTimer;
    let stopped = false;

    async function connect() {
      while (!stopped) {
        try {
          // Đọc access token hiện hành; dừng vòng lặp nếu người dùng chưa đăng nhập
          const token = getStoredAccessToken();
          if (!token) return;
          // Mở luồng SSE bằng fetch để truyền được Authorization Bearer header
          const response = await fetch(`${clientEnv.apiUrl}/events`, {
            headers: { Accept: "text/event-stream", Authorization: `Bearer ${token}` },
            signal: controller.signal,
          });
          if (!response.ok || !response.body) throw new Error("Không thể kết nối kênh cập nhật.");

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          while (!stopped) {
            const { done, value } = await reader.read();
            if (done) break;
            // Giải mã từng chunk UTF-8 và chuẩn hóa xuống dòng CRLF thành LF
            buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
            // Các sự kiện SSE hoàn chỉnh được ngăn cách bằng hai dấu xuống dòng liên tiếp
            const blocks = buffer.split("\n\n");
            // Giữ lại phần cuối chưa hoàn tất (nếu chunk bị cắt giữa chừng) để nối với chunk sau
            buffer = blocks.pop() ?? "";
            blocks.forEach(dispatchSseBlock);
          }
        } catch (error) {
          // Dừng hẳn nếu fetch bị abort có chủ đích do cleanup khi unmount
          if (error.name === "AbortError") return;
        }

        // Chờ 3 giây trước khi tự động reconnect nếu kênh bị gián đoạn tạm thời
        if (!stopped) {
          await new Promise((resolve) => { reconnectTimer = window.setTimeout(resolve, 3_000); });
        }
      }
    }

    connect();
    // Cleanup: đánh dấu dừng vòng lặp, hủy request fetch đang mở và xóa timer chờ reconnect
    return () => {
      stopped = true;
      controller.abort();
      window.clearTimeout(reconnectTimer);
    };
  }, []);
}

export default useRealtimeUpdates;
