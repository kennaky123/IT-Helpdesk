/**
 * @file usbService.js
 * @description Service giao tiếp với module giám sát thiết bị USB nội bộ (USB DLP / Endpoint Monitoring).
 * Vai trò trong kiến trúc Frontend: Thuộc tầng API Services, cung cấp các hàm lấy dữ liệu giám sát USB,
 * cấu hình chính sách cho phép/chặn, lấy thông tin mạng LAN máy chủ và tải agent cài đặt trên máy trạm.
 */
import axiosClient from "../api/axiosClient.js";
import { clientEnv } from "../config/env.js";

/**
 * Tạo đối tượng lỗi gắn mã định danh khi dữ liệu giám sát USB trả về sai định dạng.
 *
 * @param {string} message - Thông báo lỗi chi tiết.
 * @returns {Error & { code: string }} Lỗi gắn mã `"INVALID_USB_RESPONSE"`.
 */
function invalid(message) {
  const error = new Error(message);
  error.code = "INVALID_USB_RESPONSE";
  return error;
}

/**
 * Lấy dữ liệu tổng hợp giám sát USB gồm danh sách thiết bị đã ghi nhận và nhật ký sự kiện.
 *
 * @param {object} [params={}] - Tham số lọc danh sách thiết bị/sự kiện.
 * @param {{ signal?: AbortSignal }} [options] - Tùy chọn hủy request.
 * @returns {Promise<{ devices: Array<object>, events: Array<object> }>} Dữ liệu bảng điều khiển USB.
 */
export async function getUsbDashboard(params = {}, { signal } = {}) {
  const response = await axiosClient.get("/usb", { params, signal });
  const data = response.data?.data;
  if (!data || !Array.isArray(data.devices) || !Array.isArray(data.events)) {
    throw invalid("Phản hồi dữ liệu giám sát thiết bị USB không hợp lệ.");
  }
  return data;
}

/**
 * Lấy thông tin địa chỉ IP mạng LAN và cổng máy chủ để hướng dẫn cấu hình USB Agent.
 *
 * @param {{ signal?: AbortSignal }} [options] - Tùy chọn hủy request.
 * @returns {Promise<object>} Thông tin cấu hình mạng LAN của server.
 */
export async function getServerNetworkInfo({ signal } = {}) {
  const response = await axiosClient.get("/usb/network-info", { signal });
  const networkInfo = response.data?.data?.networkInfo;
  if (!networkInfo) {
    throw invalid("Phản hồi thông tin mạng LAN không hợp lệ.");
  }
  return networkInfo;
}

/**
 * Cập nhật chính sách kiểm soát (cho phép / chặn / ghi chú) cho một thiết bị USB cụ thể.
 *
 * @param {string} usbId - ID thiết bị USB cần cập nhật chính sách.
 * @param {object} payload - Dữ liệu chính sách mới (`status`, `note`...).
 * @returns {Promise<object>} Bản ghi thiết bị USB sau khi cập nhật.
 */
export async function updateUsbDevicePolicy(usbId, payload) {
  const response = await axiosClient.patch(`/usb/${usbId}/policy`, payload);
  return response.data?.data?.device;
}

/**
 * Xóa bản ghi thiết bị USB khỏi danh sách theo dõi.
 *
 * @param {string} usbId - ID thiết bị USB cần xóa.
 * @returns {Promise<object>} Phản hồi xác nhận từ máy chủ.
 */
export async function deleteUsbDevice(usbId) {
  const response = await axiosClient.delete(`/usb/${usbId}`);
  return response.data;
}

/**
 * Gửi sự kiện cắm/rút USB từ client hoặc công cụ giả lập lên server để kiểm thử/ghi nhận.
 *
 * @param {object} payload - Dữ liệu sự kiện USB (hostname, deviceName, serialNumber, eventType...).
 * @returns {Promise<object>} Kết quả xử lý sự kiện từ server.
 */
export async function sendAgentUsbEvent(payload) {
  const response = await axiosClient.post("/usb/agent-event", payload);
  return response.data?.data;
}

/**
 * Tạo đường dẫn tải xuống tệp gói USB Agent cài đặt trên máy trạm Windows.
 *
 * @returns {string} URL tuyệt đối tới endpoint tải agent.
 */
export function getAgentDownloadUrl() {
  return `${clientEnv.apiUrl}/usb/download-agent`;
}
