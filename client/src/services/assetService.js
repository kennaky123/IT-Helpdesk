/**
 * @file assetService.js
 * @description Service quản lý tài sản CNTT (CMDB), cấp phát/thu hồi thiết bị, yêu cầu cấp phát và điều khiển từ xa.
 * Vai trò trong kiến trúc Frontend: Thuộc tầng API Services, bọc toàn bộ endpoint `/assets`
 * qua `axiosClient`, kiểm tra tính hợp lệ dữ liệu phản hồi và cung cấp helper mở AnyDesk/TeamViewer.
 */
import axiosClient from "../api/axiosClient.js";

/**
 * Tạo đối tượng lỗi gắn mã định danh khi phản hồi API tài sản không hợp lệ.
 *
 * @param {string} message - Nội dung thông báo lỗi.
 * @returns {Error & { code: string }} Đối tượng lỗi có `code = "INVALID_ASSET_RESPONSE"`.
 */
function invalid(message) {
  const error = new Error(message);
  error.code = "INVALID_ASSET_RESPONSE";
  return error;
}

/**
 * Lấy danh sách thiết bị/tài sản CNTT kèm bộ lọc và thống kê phân trang.
 *
 * @param {object} [params={}] - Tham số truy vấn lọc, tìm kiếm, phân trang.
 * @param {{ signal?: AbortSignal }} [options] - Tùy chọn hủy request.
 * @returns {Promise<object>} Dữ liệu phản hồi chứa mảng `assets` và thông tin đi kèm.
 */
export async function getAssets(params = {}, { signal } = {}) {
  const response = await axiosClient.get("/assets", { params, signal });
  const data = response.data?.data;
  if (!data || !Array.isArray(data.assets)) {
    throw invalid("Phản hồi danh sách thiết bị không hợp lệ.");
  }
  return data;
}

/**
 * Lấy thông tin chi tiết một tài sản CNTT theo ID.
 *
 * @param {string} assetId - ID của tài sản cần tra cứu.
 * @param {{ signal?: AbortSignal }} [options] - Tùy chọn hủy request.
 * @returns {Promise<object>} Chi tiết đối tượng tài sản.
 */
export async function getAsset(assetId, { signal } = {}) {
  const response = await axiosClient.get(`/assets/${assetId}`, { signal });
  const asset = response.data?.data?.asset;
  if (!asset) throw invalid("Phản hồi thông tin thiết bị không hợp lệ.");
  return asset;
}

/**
 * Tạo mới một bản ghi tài sản CNTT trong CMDB.
 *
 * @param {object} payload - Thông tin thiết bị cần thêm mới.
 * @returns {Promise<object>} Tài sản vừa được khởi tạo.
 */
export async function createAsset(payload) {
  const response = await axiosClient.post("/assets", payload);
  return response.data?.data?.asset;
}

/**
 * Cập nhật thông tin một tài sản CNTT hiện có.
 *
 * @param {string} assetId - ID tài sản cần chỉnh sửa.
 * @param {object} payload - Các trường thông tin thay đổi.
 * @returns {Promise<object>} Tài sản sau khi cập nhật.
 */
export async function updateAsset(assetId, payload) {
  const response = await axiosClient.patch(`/assets/${assetId}`, payload);
  return response.data?.data?.asset;
}

/**
 * Xóa một tài sản khỏi hệ thống CMDB.
 *
 * @param {string} assetId - ID tài sản cần xóa.
 * @returns {Promise<object>} Kết quả phản hồi từ máy chủ.
 */
export async function deleteAsset(assetId) {
  const response = await axiosClient.delete(`/assets/${assetId}`);
  return response.data;
}

/**
 * Cấp phát (bàn giao) một thiết bị cho nhân viên sử dụng.
 *
 * @param {string} assetId - ID thiết bị cần cấp phát.
 * @param {{ userId: string, note?: string }} payload - ID nhân viên nhận bàn giao và ghi chú kèm theo.
 * @returns {Promise<object>} Tài sản đã cập nhật trạng thái cấp phát.
 */
export async function assignAsset(assetId, { userId, note }) {
  const response = await axiosClient.post(`/assets/${assetId}/assign`, { userId, note });
  return response.data?.data?.asset;
}

/**
 * Thu hồi thiết bị từ nhân viên và chuyển về kho hoặc trạng thái chỉ định.
 *
 * @param {string} assetId - ID thiết bị cần thu hồi.
 * @param {{ status?: string, note?: string }} payload - Trạng thái sau thu hồi (mặc định `"in_stock"`) và ghi chú.
 * @returns {Promise<object>} Tài sản sau khi thu hồi.
 */
export async function returnAsset(assetId, { status = "in_stock", note }) {
  const response = await axiosClient.post(`/assets/${assetId}/return`, { status, note });
  return response.data?.data?.asset;
}

/**
 * Lấy danh sách nhân viên hợp lệ để chọn khi cấp phát thiết bị.
 *
 * @param {{ signal?: AbortSignal }} [options] - Tùy chọn hủy request.
 * @returns {Promise<Array<object>>} Mảng nhân viên có thể nhận bàn giao tài sản.
 */
export async function getAssignableEmployees({ signal } = {}) {
  const response = await axiosClient.get("/assets/employees", { signal });
  const employees = response.data?.data?.employees;
  if (!Array.isArray(employees)) throw invalid("Phản hồi nhân viên không hợp lệ.");
  return employees;
}

/* ------------------------ Asset Requests ------------------------ */

/**
 * Lấy danh sách các yêu cầu cấp phát/mượn thiết bị từ người dùng.
 *
 * @param {object} [params={}] - Tham số lọc danh sách yêu cầu.
 * @param {{ signal?: AbortSignal }} [options] - Tùy chọn hủy request.
 * @returns {Promise<Array<object>>} Mảng các yêu cầu cấp phát thiết bị.
 */
export async function getAssetRequests(params = {}, { signal } = {}) {
  const response = await axiosClient.get("/assets/requests", { params, signal });
  const requests = response.data?.data?.requests;
  if (!Array.isArray(requests)) throw invalid("Phản hồi yêu cầu cấp phát không hợp lệ.");
  return requests;
}

/**
 * Gửi một yêu cầu đề nghị cấp phát thiết bị mới.
 *
 * @param {object} payload - Nội dung yêu cầu thiết bị.
 * @returns {Promise<object>} Bản ghi yêu cầu vừa được tạo.
 */
export async function createAssetRequest(payload) {
  const response = await axiosClient.post("/assets/requests", payload);
  return response.data?.data?.request;
}

/**
 * Tiếp nhận xử lý một yêu cầu cấp phát thiết bị đang chờ.
 *
 * @param {string} requestId - ID yêu cầu cấp phát.
 * @returns {Promise<object>} Yêu cầu sau khi chuyển trạng thái tiếp nhận.
 */
export async function acceptAssetRequest(requestId) {
  const response = await axiosClient.post(`/assets/requests/${requestId}/accept`);
  return response.data?.data?.request;
}

/**
 * Hoàn tất yêu cầu cấp phát bằng cách gán thiết bị cụ thể và ghi chú bàn giao.
 *
 * @param {string} requestId - ID yêu cầu cấp phát.
 * @param {{ assetId: string, note?: string }} payload - ID thiết bị cấp phát thực tế và ghi chú.
 * @returns {Promise<object>} Yêu cầu đã hoàn thành.
 */
export async function completeAssetRequest(requestId, { assetId, note }) {
  const response = await axiosClient.post(`/assets/requests/${requestId}/complete`, {
    assetId,
    note,
  });
  return response.data?.data?.request;
}

/**
 * Hủy bỏ một yêu cầu cấp phát thiết bị kèm lý do.
 *
 * @param {string} requestId - ID yêu cầu cần hủy.
 * @param {{ reason: string }} payload - Lý do hủy yêu cầu.
 * @returns {Promise<object>} Yêu cầu sau khi chuyển trạng thái đã hủy.
 */
export async function cancelAssetRequest(requestId, { reason }) {
  const response = await axiosClient.post(`/assets/requests/${requestId}/cancel`, {
    reason,
  });
  return response.data?.data?.request;
}

/**
 * Mở ứng dụng điều khiển từ xa bằng URL Protocol Scheme (AnyDesk / TeamViewer)
 * và tự động copy Remote ID vào clipboard.
 *
 * @param {"anydesk" | "teamviewer"} tool - Loại phần mềm điều khiển từ xa cần mở.
 * @param {string | number} rawId - ID kết nối từ xa (có thể chứa khoảng trắng).
 * @returns {Promise<{ appName: string, id: string, protocolUrl: string }>} Thông tin ứng dụng và URL protocol đã kích hoạt.
 */
export async function launchRemoteDesktop(tool, rawId) {
  // Loại bỏ toàn bộ khoảng trắng trong mã ID trước khi tạo URI và copy
  const id = String(rawId || "").replace(/\s+/g, "");
  if (!id) {
    throw new Error("Chưa có ID điều khiển từ xa cho thiết bị này.");
  }

  // Tự động copy ID vào Clipboard
  try {
    // Dynamic import giúp chỉ nạp module clipboard khi thực sự có thao tác điều khiển từ xa
    const { copyTextToClipboard } = await import("../utils/clipboard.js");
    await copyTextToClipboard(id);
  } catch {
    // Bỏ qua lỗi clipboard nếu trình duyệt chặn
  }

  let protocolUrl;
  let appName;

  // Xây dựng custom protocol URL tương ứng với phần mềm điều khiển được chọn
  if (tool === "teamviewer") {
    protocolUrl = `teamviewer10://control?device=${id}`;
    appName = "TeamViewer";
  } else {
    protocolUrl = `anydesk:${id}`;
    appName = "AnyDesk";
  }

  // Mở deep-link
  window.location.href = protocolUrl;

  return { appName, id, protocolUrl };
}
