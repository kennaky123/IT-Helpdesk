import { useEffect } from "react";
import { clientEnv } from "../config/env.js";
import { queryClient } from "../lib/queryClient.js";
import { useUiStore } from "../stores/useUiStore.js";
import { getStoredAccessToken } from "../utils/authStorage.js";

export const REALTIME_DATA_EVENT = "it-helpdesk:data-changed";

const RESOURCE_QUERY_PREFIXES = {
  tickets: [["tickets"], ["ticket"], ["dashboard"]],
  categories: [["categories"], ["tickets", "filter-options"]],
  users: [["technicians"], ["admin", "users"], ["tickets", "filter-options"], ["dashboard"]],
  admin: [["admin"], ["categories"], ["technicians"], ["tickets", "filter-options"], ["dashboard"]],
  assets: [["assets"], ["dashboard"]],
  software: [["software"], ["dashboard"]],
  usb: [["usb"], ["dashboard"]],
};

function invalidateResourceQueries(resource) {
  const prefixes = RESOURCE_QUERY_PREFIXES[resource];
  if (!prefixes) {
    queryClient.invalidateQueries();
    return;
  }
  prefixes.forEach((queryKey) => {
    queryClient.invalidateQueries({ queryKey });
  });
}

function pushRealtimeNotification(detail) {
  const { addNotification } = useUiStore.getState();

  if (detail.usbAlert) {
    const alert = detail.usbAlert;
    const hostText = `${alert.hostname}${alert.osUsername ? ` (${alert.osUsername})` : ""}`;
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

function dispatchSseBlock(block) {
  const lines = block.split("\n");
  const eventName = lines.find((line) => line.startsWith("event:"))?.slice(6).trim();
  if (eventName !== "data-changed") return;
  const data = lines.filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("\n");
  let detail;
  try { detail = JSON.parse(data); } catch { return; }

  invalidateResourceQueries(detail.resource);
  pushRealtimeNotification(detail);
  window.dispatchEvent(new CustomEvent(REALTIME_DATA_EVENT, { detail }));
}

function useRealtimeUpdates() {
  useEffect(() => {
    const controller = new AbortController();
    let reconnectTimer;
    let stopped = false;

    async function connect() {
      while (!stopped) {
        try {
          const token = getStoredAccessToken();
          if (!token) return;
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
            buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
            const blocks = buffer.split("\n\n");
            buffer = blocks.pop() ?? "";
            blocks.forEach(dispatchSseBlock);
          }
        } catch (error) {
          if (error.name === "AbortError") return;
        }

        if (!stopped) {
          await new Promise((resolve) => { reconnectTimer = window.setTimeout(resolve, 3_000); });
        }
      }
    }

    connect();
    return () => {
      stopped = true;
      controller.abort();
      window.clearTimeout(reconnectTimer);
    };
  }, []);
}

export default useRealtimeUpdates;
