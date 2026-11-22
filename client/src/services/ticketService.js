/**
 * @file ticketService.js
 * @description Service trung tâm xử lý toàn bộ nghiệp vụ Ticket: danh sách, bộ lọc, tạo mới kèm upload ảnh,
 * xem chi tiết/bình luận/lịch sử, tải tệp đính kèm dạng Blob, chuyển trạng thái và chuẩn hóa thông báo lỗi.
 * Vai trò trong kiến trúc Frontend: Thuộc tầng API Services, giao tiếp với các endpoint `/tickets/*`
 * qua `axiosClient` và kiểm chứng toàn bộ dữ liệu phản hồi trước khi trả về cho React Query / UI.
 */
import axiosClient from "../api/axiosClient.js";
import { getActiveCategories } from "./categoryService.js";
import { getActiveTechnicians } from "./userService.js";

/**
 * Kiểm tra cấu trúc tối thiểu của một phần tử ticket trong danh sách.
 *
 * @param {any} ticket - Đối tượng ticket tóm tắt.
 * @returns {boolean}
 */
function isValidTicket(ticket) {
  return Boolean(
    ticket &&
      typeof ticket._id === "string" &&
      typeof ticket.ticketCode === "string" &&
      typeof ticket.title === "string" &&
      typeof ticket.priority === "string" &&
      typeof ticket.status === "string" &&
      typeof ticket.createdAt === "string",
  );
}

/**
 * Kiểm tra cấu trúc chuẩn của metadata phân trang trả về từ Backend.
 *
 * @param {any} pagination - Đối tượng phân trang.
 * @returns {boolean}
 */
function isValidPagination(pagination) {
  return Boolean(
    pagination &&
      Number.isInteger(pagination.page) &&
      Number.isInteger(pagination.limit) &&
      Number.isInteger(pagination.totalItems) &&
      Number.isInteger(pagination.totalPages) &&
      typeof pagination.hasPreviousPage === "boolean" &&
      typeof pagination.hasNextPage === "boolean",
  );
}

/**
 * Tạo đối tượng lỗi gắn mã `"INVALID_TICKET_RESPONSE"` khi dữ liệu từ server không đạt kiểm chứng.
 *
 * @param {string} message - Thông báo lỗi chi tiết.
 * @returns {Error & { code: string }}
 */
function createInvalidResponseError(message) {
  const error = new Error(message);
  error.code = "INVALID_TICKET_RESPONSE";
  return error;
}

/**
 * Kiểm tra cấu trúc phản hồi tối thiểu ngay sau khi tạo ticket mới.
 *
 * @param {any} ticket - Đối tượng ticket vừa tạo.
 * @returns {boolean}
 */
function isValidCreatedTicket(ticket) {
  return Boolean(
    ticket &&
      typeof ticket._id === "string" &&
      typeof ticket.ticketCode === "string",
  );
}

/**
 * Kiểm tra cấu trúc đầy đủ của trang chi tiết một ticket (gồm mô tả và mảng đính kèm).
 *
 * @param {any} ticket - Đối tượng chi tiết ticket.
 * @returns {boolean}
 */
function isValidTicketDetail(ticket) {
  return Boolean(
    ticket &&
      typeof ticket._id === "string" &&
      typeof ticket.ticketCode === "string" &&
      typeof ticket.title === "string" &&
      typeof ticket.description === "string" &&
      typeof ticket.priority === "string" &&
      typeof ticket.status === "string" &&
      typeof ticket.createdAt === "string" &&
      Array.isArray(ticket.attachments),
  );
}

/**
 * Kiểm tra cấu trúc của một bình luận hoặc ghi chú nội bộ trên ticket.
 *
 * @param {any} comment - Đối tượng bình luận.
 * @returns {boolean}
 */
function isValidComment(comment) {
  return Boolean(
    comment &&
      typeof comment._id === "string" &&
      typeof comment.content === "string" &&
      typeof comment.isInternal === "boolean" &&
      typeof comment.createdAt === "string" &&
      comment.sender &&
      typeof comment.sender.fullName === "string",
  );
}

/**
 * Kiểm tra cấu trúc một mục nhật ký lịch sử thay đổi (trạng thái hoặc phân công) của ticket.
 *
 * @param {any} item - Phần tử lịch sử ticket.
 * @returns {boolean}
 */
function isValidHistoryItem(item) {
  return Boolean(
    item &&
      typeof item._id === "string" &&
      ["status_change", "assignment"].includes(item.type) &&
      typeof item.occurredAt === "string",
  );
}

/**
 * Chuẩn hóa kết quả trả về cho các thao tác cập nhật (mutation) ticket hoặc comment.
 *
 * @param {import("axios").AxiosResponse} response - Phản hồi từ axios.
 * @param {string} fieldName - Tên trường chứa bản ghi kết quả trong `response.data.data` (`"ticket"` hoặc `"comment"`).
 * @param {Function} validator - Hàm kiểm chứng cấu trúc dữ liệu trả về.
 * @returns {{ data: object, message: string }} Bản ghi đã xác thực và thông báo thành công.
 */
function getMutationResult(response, fieldName, validator) {
  const value = response.data?.data?.[fieldName];

  if (!validator(value)) {
    throw createInvalidResponseError("Phản hồi cập nhật ticket không hợp lệ.");
  }

  return {
    data: value,
    message:
      typeof response.data?.message === "string"
        ? response.data.message
        : "Cập nhật thành công.",
  };
}

/**
 * Lọc và đóng gói các tham số truy vấn không rỗng để gửi API lấy danh sách ticket.
 *
 * @param {object} query - Đối tượng tham số phân trang và bộ lọc.
 * @returns {object} Object params sạch đã loại bỏ các bộ lọc rỗng.
 */
function buildTicketParams(query) {
  const params = {
    page: query.page,
    limit: query.limit,
    sortOrder: query.sortOrder,
  };

  // Chỉ đính kèm các tham số bộ lọc có giá trị thực tế lên query string
  for (const field of [
    "search",
    "status",
    "statuses",
    "priority",
    "category",
    "technician",
  ]) {
    if (query[field]) {
      params[field] = query[field];
    }
  }

  return params;
}

/**
 * Lấy danh sách ticket có phân trang, tìm kiếm và bộ lọc.
 *
 * @param {object} query - Tham số truy vấn danh sách ticket.
 * @param {{ signal?: AbortSignal }} [options] - Tùy chọn hủy request từ React Query.
 * @returns {Promise<{ tickets: Array<object>, pagination: object }>} Danh sách ticket và thông tin phân trang.
 */
export async function getTicketList(query, { signal } = {}) {
  const response = await axiosClient.get("/tickets", {
    params: buildTicketParams(query),
    signal,
  });
  const result = response.data?.data;

  if (
    !result ||
    !Array.isArray(result.tickets) ||
    !result.tickets.every(isValidTicket) ||
    !isValidPagination(result.pagination)
  ) {
    throw createInvalidResponseError("Phản hồi danh sách ticket không hợp lệ.");
  }

  return result;
}

/**
 * Tải đồng thời danh sách danh mục và kỹ thuật viên đang hoạt động để làm tùy chọn bộ lọc.
 *
 * @param {{ signal?: AbortSignal }} [options] - Tùy chọn hủy request.
 * @returns {Promise<{ categories: Array<object>, technicians: Array<{ id: string, name: string }> }>}
 */
export async function getTicketFilterOptions({ signal } = {}) {
  // Gọi song song hai API độc lập để rút ngắn thời gian tải tùy chọn bộ lọc
  const [categories, technicianRecords] = await Promise.all([
    getActiveCategories({ signal }),
    getActiveTechnicians({ signal }),
  ]);
  // Chuẩn hóa và sắp xếp tên kỹ thuật viên theo thứ tự bảng chữ cái tiếng Việt
  const technicians = technicianRecords
    .map((technician) => ({
      id: technician._id,
      name: technician.fullName.trim(),
    }))
    .sort((left, right) => left.name.localeCompare(right.name, "vi"));

  return { categories, technicians };
}

/**
 * Tạo một ticket yêu cầu hỗ trợ mới kèm tệp ảnh đính kèm (multipart/form-data).
 *
 * @param {{
 *   title: string,
 *   category: string,
 *   priority: string,
 *   description: string,
 *   technicianId?: string,
 *   attachments: Array<{ file: File }>
 * }} payload - Dữ liệu form tạo ticket và danh sách file đính kèm.
 * @param {{ signal?: AbortSignal, onUploadProgress?: Function }} [options] - Theo dõi tiến trình upload và hủy request.
 * @returns {Promise<{ ticket: object, message: string }>} Ticket vừa tạo và thông báo từ server.
 */
export async function createTicket(
  { title, category, priority, description, technicianId, attachments },
  { signal, onUploadProgress } = {},
) {
  // Đóng gói dữ liệu văn bản và tệp đính kèm bằng FormData để upload multipart
  const formData = new FormData();
  formData.append("title", title.trim());
  formData.append("category", category);
  formData.append("priority", priority);
  formData.append("description", description.trim());
  if (technicianId) {
    formData.append("technicianId", technicianId);
  }

  attachments.forEach(({ file }) => {
    formData.append("attachments", file);
  });

  // Tăng timeout lên 30 giây vì request có thể mang theo nhiều tệp ảnh đính kèm
  const response = await axiosClient.post("/tickets", formData, {
    signal,
    timeout: 30_000,
    onUploadProgress,
  });
  const ticket = response.data?.data?.ticket;

  if (!isValidCreatedTicket(ticket)) {
    throw createInvalidResponseError("Phản hồi tạo ticket không hợp lệ.");
  }

  return {
    ticket,
    message:
      typeof response.data?.message === "string"
        ? response.data.message
        : "Tạo yêu cầu thành công.",
  };
}

/**
 * Lấy thông tin chi tiết của một ticket theo ID.
 *
 * @param {string} ticketId - ID ticket cần xem.
 * @param {{ signal?: AbortSignal }} [options] - Tùy chọn hủy request.
 * @returns {Promise<object>} Dữ liệu chi tiết ticket.
 */
export async function getTicketDetail(ticketId, { signal } = {}) {
  const response = await axiosClient.get(`/tickets/${ticketId}`, { signal });
  const ticket = response.data?.data?.ticket;

  if (!isValidTicketDetail(ticket)) {
    throw createInvalidResponseError("Phản hồi chi tiết ticket không hợp lệ.");
  }

  return ticket;
}

/**
 * Lấy danh sách bình luận và ghi chú nội bộ của ticket, sắp xếp theo trình tự thời gian từ cũ đến mới.
 *
 * @param {string} ticketId - ID ticket.
 * @param {{ signal?: AbortSignal }} [options] - Tùy chọn hủy request.
 * @returns {Promise<{ comments: Array<object>, pagination: object }>} Luồng trao đổi đã đảo ngược đúng thứ tự hiển thị.
 */
export async function getTicketComments(ticketId, { signal } = {}) {
  // Yêu cầu 100 comment mới nhất (desc) rồi đảo ngược lại thành thứ tự cũ -> mới để hiển thị kiểu hội thoại
  const response = await axiosClient.get(`/tickets/${ticketId}/comments`, {
    signal,
    params: { page: 1, limit: 100, sortOrder: "desc" },
  });
  const result = response.data?.data;

  if (
    !result ||
    !Array.isArray(result.comments) ||
    !result.comments.every(isValidComment) ||
    !isValidPagination(result.pagination)
  ) {
    throw createInvalidResponseError("Phản hồi trao đổi ticket không hợp lệ.");
  }

  return {
    ...result,
    comments: [...result.comments].reverse(),
  };
}

/**
 * Lấy lịch sử thay đổi trạng thái và phân công của ticket.
 *
 * @param {string} ticketId - ID ticket.
 * @param {{ signal?: AbortSignal }} [options] - Tùy chọn hủy request.
 * @returns {Promise<Array<object>>} Mảng các sự kiện lịch sử.
 */
export async function getTicketHistory(ticketId, { signal } = {}) {
  const response = await axiosClient.get(`/tickets/${ticketId}/history`, {
    signal,
  });
  const result = response.data?.data;

  if (!result || !Array.isArray(result.history) || !result.history.every(isValidHistoryItem)) {
    throw createInvalidResponseError("Phản hồi lịch sử ticket không hợp lệ.");
  }

  return result.history;
}

/**
 * Tải nội dung tệp đính kèm của ticket dưới dạng `Blob` (đi qua axiosClient để mang theo Bearer token).
 *
 * @param {string} ticketId - ID ticket chứa tệp đính kèm.
 * @param {string} attachmentId - ID tệp đính kèm.
 * @param {{ signal?: AbortSignal }} [options] - Tùy chọn hủy request.
 * @returns {Promise<Blob>} Dữ liệu nhị phân của tệp đính kèm.
 */
export async function getTicketAttachmentBlob(
  ticketId,
  attachmentId,
  { signal } = {},
) {
  const response = await axiosClient.get(
    `/tickets/${ticketId}/attachments/${attachmentId}`,
    { signal, responseType: "blob", timeout: 30_000 },
  );

  return response.data;
}

/**
 * Gửi một bình luận công khai mới vào ticket.
 *
 * @param {string} ticketId - ID ticket.
 * @param {string} content - Nội dung bình luận.
 * @returns {Promise<{ data: object, message: string }>} Bình luận vừa tạo.
 */
export async function postTicketComment(ticketId, content) {
  const response = await axiosClient.post(`/tickets/${ticketId}/comments`, {
    content,
  });
  return getMutationResult(response, "comment", isValidComment);
}

/**
 * Tạo ghi chú nội bộ trên ticket (chỉ Admin và Kỹ thuật viên phụ trách mới thấy).
 *
 * @param {string} ticketId - ID ticket.
 * @param {string} content - Nội dung ghi chú nội bộ.
 * @returns {Promise<{ data: object, message: string }>} Ghi chú nội bộ vừa tạo.
 */
export async function postInternalNote(ticketId, content) {
  const response = await axiosClient.post(
    `/tickets/${ticketId}/internal-notes`,
    { content },
  );
  return getMutationResult(response, "comment", isValidComment);
}

/**
 * Phân công hoặc nhận xử lý ticket cho kỹ thuật viên.
 *
 * @param {string} ticketId - ID ticket.
 * @param {object} payload - Thông tin phân công (vd: `{ technicianId }`).
 * @returns {Promise<{ data: object, message: string }>} Ticket sau khi phân công.
 */
export async function assignTicket(ticketId, payload) {
  const response = await axiosClient.patch(
    `/tickets/${ticketId}/assign`,
    payload,
  );
  return getMutationResult(response, "ticket", isValidTicketDetail);
}

/**
 * Cập nhật trạng thái xử lý của ticket theo luồng chuyển trạng thái hợp lệ.
 *
 * @param {string} ticketId - ID ticket.
 * @param {object} payload - Trạng thái mới và ghi chú/lý do kèm theo.
 * @returns {Promise<{ data: object, message: string }>} Ticket sau khi chuyển trạng thái.
 */
export async function updateTicketStatus(ticketId, payload) {
  const response = await axiosClient.patch(
    `/tickets/${ticketId}/status`,
    payload,
  );
  return getMutationResult(response, "ticket", isValidTicketDetail);
}

/**
 * Cập nhật nội dung giải pháp / kết quả khắc phục sự cố của ticket.
 *
 * @param {string} ticketId - ID ticket.
 * @param {string} resolution - Mô tả giải pháp xử lý.
 * @returns {Promise<{ data: object, message: string }>} Ticket đã cập nhật giải pháp.
 */
export async function updateTicketResolution(ticketId, resolution) {
  const response = await axiosClient.patch(
    `/tickets/${ticketId}/resolution`,
    { resolution },
  );
  return getMutationResult(response, "ticket", isValidTicketDetail);
}

/**
 * Hủy bỏ một ticket kèm lý do hủy.
 *
 * @param {string} ticketId - ID ticket cần hủy.
 * @param {string} reason - Lý do hủy ticket.
 * @returns {Promise<{ data: object, message: string }>} Ticket sau khi chuyển sang trạng thái `"cancelled"`.
 */
export async function cancelTicket(ticketId, reason) {
  const response = await axiosClient.patch(`/tickets/${ticketId}/cancel`, {
    reason,
  });
  return getMutationResult(response, "ticket", isValidTicketDetail);
}

/**
 * Xác nhận đóng hoàn tất một ticket đã ở trạng thái giải quyết (`resolved`).
 *
 * @param {string} ticketId - ID ticket cần đóng.
 * @param {string} note - Ghi chú đóng ticket hoặc phản hồi xác nhận.
 * @returns {Promise<{ data: object, message: string }>} Ticket sau khi chuyển sang trạng thái `"closed"`.
 */
export async function closeTicket(ticketId, note) {
  const response = await axiosClient.patch(`/tickets/${ticketId}/close`, {
    note,
  });
  return getMutationResult(response, "ticket", isValidTicketDetail);
}

/**
 * Chuyển đổi lỗi khi xem hoặc thao tác trên chi tiết ticket thành thông báo tiếng Việt.
 *
 * @param {any} error - Đối tượng lỗi từ axios hoặc validator.
 * @returns {string} Thông báo lỗi dễ hiểu cho người dùng.
 */
export function getTicketDetailErrorMessage(error) {
  if (error?.code === "ECONNABORTED") {
    return "Máy chủ phản hồi quá lâu. Vui lòng thử lại.";
  }

  if (error?.code === "INVALID_TICKET_RESPONSE") {
    return "Dữ liệu ticket nhận được không đúng định dạng.";
  }

  if (!error?.response) {
    return "Không thể kết nối đến máy chủ. Vui lòng kiểm tra kết nối.";
  }

  if (error.response.status === 404) {
    return "Không tìm thấy ticket hoặc bạn không có quyền truy cập.";
  }

  if (error.response.status === 403) {
    return "Tài khoản của bạn không có quyền thực hiện thao tác này.";
  }

  const apiMessage = error.response.data?.message;
  return typeof apiMessage === "string" && apiMessage.length > 0
    ? apiMessage
    : "Không thể tải dữ liệu ticket. Vui lòng thử lại.";
}

/**
 * Trích xuất thông báo lỗi và mảng chi tiết lỗi validation khi thực hiện các action trên ticket.
 *
 * @param {any} error - Lỗi phát sinh khi gọi mutation API.
 * @returns {{ message: string, details: Array<string> }}
 */
export function getTicketActionError(error) {
  const message = getTicketDetailErrorMessage(error);
  const details = Array.isArray(error?.response?.data?.errors)
    ? error.response.data.errors.filter((item) => typeof item === "string")
    : [];

  return { message, details };
}

/**
 * Chuẩn hóa thông báo lỗi khi gửi yêu cầu tạo ticket mới (xử lý riêng lỗi quá dung lượng ảnh 413 và mất mạng).
 *
 * @param {any} error - Lỗi nhận được khi submit form tạo ticket.
 * @returns {{ message: string, details: Array<string> }}
 */
export function getCreateTicketError(error) {
  if (error?.code === "ECONNABORTED") {
    return {
      message: "Thời gian gửi yêu cầu đã hết. Vui lòng thử lại.",
      details: [],
    };
  }

  if (error?.code === "INVALID_TICKET_RESPONSE") {
    return {
      message: "Máy chủ đã tạo ticket nhưng phản hồi không đúng định dạng.",
      details: [],
    };
  }

  if (!error?.response) {
    return {
      message: "Không thể kết nối đến máy chủ. Dữ liệu trong form vẫn được giữ lại.",
      details: [],
    };
  }

  const status = error.response.status;
  const responseData = error.response.data;
  const details = Array.isArray(responseData?.errors)
    ? responseData.errors.filter((item) => typeof item === "string")
    : [];

  if (status === 403) {
    return {
      message: "Tài khoản của bạn không có quyền tạo yêu cầu hỗ trợ.",
      details,
    };
  }

  // Mã 413 Payload Too Large khi ảnh vượt giới hạn phía server/proxy
  if (status === 413) {
    return {
      message: "Ảnh đính kèm vượt quá dung lượng cho phép.",
      details,
    };
  }

  if (status >= 500) {
    return {
      message: "Máy chủ đang gặp sự cố. Vui lòng thử lại sau.",
      details,
    };
  }

  return {
    message:
      typeof responseData?.message === "string" && responseData.message.length > 0
        ? responseData.message
        : "Không thể tạo yêu cầu. Vui lòng kiểm tra lại thông tin.",
    details,
  };
}

/**
 * Chuẩn hóa thông báo lỗi khi tải danh sách ticket hoặc dữ liệu tùy chọn bộ lọc.
 *
 * @param {any} error - Lỗi phát sinh từ `getTicketList` hoặc `getTicketFilterOptions`.
 * @returns {string} Thông báo lỗi tiếng Việt tương ứng.
 */
export function getTicketListErrorMessage(error) {
  if (error?.code === "ECONNABORTED") {
    return "Máy chủ phản hồi quá lâu. Vui lòng thử lại.";
  }

  if (error?.code === "INVALID_TICKET_RESPONSE") {
    return "Dữ liệu danh sách ticket nhận được không đúng định dạng.";
  }

  if (
    error?.code === "INVALID_CATEGORY_RESPONSE" ||
    error?.code === "INVALID_USER_RESPONSE"
  ) {
    return "Dữ liệu tùy chọn bộ lọc nhận được không đúng định dạng.";
  }

  if (!error?.response) {
    return "Không thể kết nối đến máy chủ. Vui lòng kiểm tra kết nối và thử lại.";
  }

  if (error.response.status === 403) {
    return "Tài khoản của bạn không có quyền xem danh sách ticket này.";
  }

  if (error.response.status >= 500) {
    return "Máy chủ đang gặp sự cố khi tải danh sách ticket.";
  }

  const apiMessage = error.response.data?.message;
  return typeof apiMessage === "string" && apiMessage.length > 0
    ? apiMessage
    : "Không thể tải danh sách ticket. Vui lòng thử lại.";
}
