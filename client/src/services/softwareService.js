/**
 * @file softwareService.js
 * @description Service quản lý danh mục phần mềm bản quyền (Software Licenses), phân bổ/thu hồi suất license và báo cáo FinOps.
 * Vai trò trong kiến trúc Frontend: Thuộc tầng API Services, giao tiếp với các endpoint `/software/*`
 * qua `axiosClient` và cung cấp hàm định dạng chi phí VNĐ cho giao diện quản lý bản quyền.
 */
import axiosClient from "../api/axiosClient.js";

/**
 * Tạo đối tượng lỗi chuẩn khi phản hồi API quản lý bản quyền phần mềm không hợp lệ.
 *
 * @param {string} message - Thông báo lỗi chi tiết.
 * @returns {Error & { code: string }} Lỗi gắn mã `"INVALID_SOFTWARE_RESPONSE"`.
 */
function invalid(message) {
  const error = new Error(message);
  error.code = "INVALID_SOFTWARE_RESPONSE";
  return error;
}

/**
 * Lấy danh sách bản quyền phần mềm theo bộ lọc và phân trang.
 *
 * @param {object} [params={}] - Tham số lọc/tìm kiếm/phân trang.
 * @param {{ signal?: AbortSignal }} [options] - Tùy chọn hủy request.
 * @returns {Promise<object>} Dữ liệu chứa mảng `licenses` và thông tin bổ sung.
 */
export async function getSoftwareLicenses(params = {}, { signal } = {}) {
  const response = await axiosClient.get("/software", { params, signal });
  const data = response.data?.data;
  if (!data || !Array.isArray(data.licenses)) {
    throw invalid("Phản hồi danh sách bản quyền phần mềm không hợp lệ.");
  }
  return data;
}

/**
 * Lấy thông tin chi tiết một gói bản quyền phần mềm theo ID.
 *
 * @param {string} licenseId - ID gói bản quyền phần mềm.
 * @param {{ signal?: AbortSignal }} [options] - Tùy chọn hủy request.
 * @returns {Promise<object>} Chi tiết bản quyền phần mềm.
 */
export async function getSoftwareLicense(licenseId, { signal } = {}) {
  const response = await axiosClient.get(`/software/${licenseId}`, { signal });
  const license = response.data?.data?.license;
  if (!license) throw invalid("Phản hồi thông tin bản quyền không hợp lệ.");
  return license;
}

/**
 * Lấy báo cáo tổng hợp chi phí bản quyền phần mềm (FinOps Summary).
 *
 * @param {{ signal?: AbortSignal }} [options] - Tùy chọn hủy request.
 * @returns {Promise<object>} Dữ liệu phân tích chi phí và tỷ lệ sử dụng license.
 */
export async function getFinOpsSummary({ signal } = {}) {
  const response = await axiosClient.get("/software/finops", { signal });
  const finOps = response.data?.data?.finOps;
  if (!finOps) throw invalid("Phản hồi báo cáo FinOps không hợp lệ.");
  return finOps;
}

/**
 * Tạo mới một bản ghi bản quyền phần mềm.
 *
 * @param {object} payload - Thông tin gói license (tên phần mềm, số ghế, chi phí, ngày gia hạn...).
 * @returns {Promise<object>} Bản ghi license vừa được tạo.
 */
export async function createSoftwareLicense(payload) {
  const response = await axiosClient.post("/software", payload);
  return response.data?.data?.license;
}

/**
 * Cập nhật thông tin gói bản quyền phần mềm theo ID.
 *
 * @param {string} licenseId - ID bản quyền cần chỉnh sửa.
 * @param {object} payload - Dữ liệu cập nhật.
 * @returns {Promise<object>} Bản ghi license sau khi cập nhật.
 */
export async function updateSoftwareLicense(licenseId, payload) {
  const response = await axiosClient.patch(`/software/${licenseId}`, payload);
  return response.data?.data?.license;
}

/**
 * Xóa một gói bản quyền phần mềm khỏi hệ thống.
 *
 * @param {string} licenseId - ID bản quyền cần xóa.
 * @returns {Promise<object>} Phản hồi xác nhận từ Backend.
 */
export async function deleteSoftwareLicense(licenseId) {
  const response = await axiosClient.delete(`/software/${licenseId}`);
  return response.data;
}

/**
 * Cấp phát một suất bản quyền phần mềm cho người dùng cụ thể.
 *
 * @param {string} licenseId - ID gói bản quyền.
 * @param {{ userId: string, note?: string }} payload - ID nhân viên được cấp và ghi chú.
 * @returns {Promise<object>} Bản ghi license sau khi cập nhật danh sách cấp phát.
 */
export async function allocateLicense(licenseId, { userId, note }) {
  const response = await axiosClient.post(`/software/${licenseId}/allocate`, {
    userId,
    note,
  });
  return response.data?.data?.license;
}

/**
 * Thu hồi suất bản quyền phần mềm đang cấp cho một người dùng.
 *
 * @param {string} licenseId - ID gói bản quyền.
 * @param {{ userId: string }} payload - ID nhân viên bị thu hồi license.
 * @returns {Promise<object>} Bản ghi license sau khi thu hồi.
 */
export async function revokeLicense(licenseId, { userId }) {
  const response = await axiosClient.post(`/software/${licenseId}/revoke`, {
    userId,
  });
  return response.data?.data?.license;
}

/**
 * Định dạng số tiền sang chuẩn tiền tệ Việt Nam Đồng (VNĐ).
 *
 * @param {number | string | null | undefined} amount - Số tiền cần định dạng.
 * @returns {string} Chuỗi tiền tệ đã định dạng (vd: "1.500.000 ₫").
 */
export function formatCurrencyVND(amount) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
  }).format(Number(amount || 0));
}
