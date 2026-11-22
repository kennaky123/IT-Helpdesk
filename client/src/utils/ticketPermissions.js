/**
 * @file ticketPermissions.js
 * @description Định nghĩa luồng chuyển trạng thái ticket, nhãn hiển thị và logic phân quyền thao tác theo vai trò.
 * Vai trò trong kiến trúc Frontend: Thuộc tầng Utility helpers, đóng vai trò nguồn quy tắc tập trung
 * quyết định người dùng hiện tại được phép thực hiện hành động nào trên từng ticket cụ thể.
 */

// Bảng định nghĩa máy trạng thái (state machine): các bước chuyển tiếp hợp lệ từ trạng thái hiện tại
const STATUS_TRANSITIONS = Object.freeze({
  assigned: Object.freeze(["in_progress"]),
  in_progress: Object.freeze(["waiting_user", "resolved"]),
  waiting_user: Object.freeze(["in_progress"]),
});

// Nhóm trạng thái kết thúc: không thể phân công lại hoặc tự nhận xử lý
const TERMINAL_STATUSES = new Set(["resolved", "closed", "cancelled"]);
// Nhóm trạng thái chỉ đọc: khóa toàn bộ việc gửi bình luận mới và ghi chú nội bộ
const READ_ONLY_COMMENT_STATUSES = new Set(["closed", "cancelled"]);
// Bảng ánh xạ mã trạng thái sang nhãn hiển thị tiếng Việt
const STATUS_LABELS = Object.freeze({
  pending: "Đang chờ",
  assigned: "Đã phân công",
  in_progress: "Đang xử lý",
  waiting_user: "Chờ người dùng",
  resolved: "Đã giải quyết (Hoàn thành)",
  closed: "Đã đóng",
  cancelled: "Đã hủy",
});
// Bảng ánh xạ mức độ ưu tiên sang nhãn tiếng Việt
const PRIORITY_LABELS = Object.freeze({
  low: "Thấp",
  medium: "Trung bình",
  high: "Cao",
  urgent: "Khẩn cấp",
});
// Bộ định dạng mốc thời gian ticket cố định theo múi giờ Việt Nam
const dateTimeFormatter = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Ho_Chi_Minh",
});

/**
 * Chuẩn hóa lấy ID dạng chuỗi từ một tham chiếu (có thể là string ID hoặc object đã populate `{ _id }`).
 *
 * @param {string | { _id?: string } | null | undefined} value - Giá trị tham chiếu người dùng.
 * @returns {string | null} Chuỗi ID hoặc `null` nếu không có.
 */
function referenceId(value) {
  if (!value) {
    return null;
  }

  return String(value._id ?? value);
}

/**
 * Lấy danh sách các trạng thái tiếp theo hợp lệ có thể chuyển tới từ trạng thái hiện tại.
 *
 * @param {string} status - Trạng thái hiện tại của ticket.
 * @returns {ReadonlyArray<string>} Mảng mã trạng thái kế tiếp hợp lệ.
 */
export function getStatusTransitions(status) {
  return STATUS_TRANSITIONS[status] ?? [];
}

/**
 * Chuyển mã trạng thái ticket sang nhãn tiếng Việt dễ đọc.
 *
 * @param {string} status - Mã trạng thái (vd: "in_progress").
 * @returns {string} Nhãn tiếng Việt tương ứng hoặc `"Không xác định"`.
 */
export function getTicketStatusLabel(status) {
  return STATUS_LABELS[status] ?? status ?? "Không xác định";
}

/**
 * Chuyển mã mức độ ưu tiên của ticket sang nhãn tiếng Việt.
 *
 * @param {string} priority - Mã ưu tiên (vd: "urgent").
 * @returns {string} Nhãn tiếng Việt tương ứng hoặc `"Không xác định"`.
 */
export function getTicketPriorityLabel(priority) {
  return PRIORITY_LABELS[priority] ?? priority ?? "Không xác định";
}

/**
 * Định dạng mốc thời gian trên ticket theo chuẩn `vi-VN` và múi giờ `Asia/Ho_Chi_Minh`.
 *
 * @param {string | number | Date} value - Thời gian cần hiển thị.
 * @returns {string} Chuỗi ngày giờ đã định dạng hoặc `"—"` nếu không hợp lệ.
 */
export function formatTicketDateTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : dateTimeFormatter.format(date);
}

/**
 * Tính toán toàn bộ cờ phân quyền thao tác trên một ticket cụ thể đối với người dùng hiện tại.
 *
 * Quy tắc phân quyền chính:
 * - `canAssign`: Admin hoặc bất kỳ kỹ thuật viên nào, khi ticket chưa ở trạng thái kết thúc.
 * - `canSelfAssign`: Kỹ thuật viên chưa được gán vào ticket này và ticket chưa kết thúc.
 * - `canUpdateStatus`: Admin hoặc kỹ thuật viên đang phụ trách ticket, khi còn trạng thái kế tiếp hợp lệ.
 * - `canEditResolution`: Chỉ kỹ thuật viên phụ trách khi ticket đang xử lý hoặc chờ người dùng.
 * - `canComment`: Người tạo ticket (role user) hoặc kỹ thuật viên phụ trách khi ticket chưa đóng/hủy.
 * - `canCreateInternalNote`: Chỉ kỹ thuật viên phụ trách khi ticket chưa đóng/hủy.
 * - `canCancel`: Người tạo được hủy lúc mới tạo/đã phân công; Admin được hủy ở mọi trạng thái chưa kết thúc.
 * - `canClose`: Người tạo, Admin hoặc kỹ thuật viên khi ticket đã ở trạng thái `resolved`.
 * - `canViewInternalContent`: Admin hoặc kỹ thuật viên đang phụ trách ticket.
 *
 * @param {object | null | undefined} ticket - Dữ liệu chi tiết ticket.
 * @param {object | null | undefined} user - Thông tin tài khoản đang đăng nhập.
 * @returns {{
 *   isOwner: boolean,
 *   isAssignee: boolean,
 *   canAssign: boolean,
 *   canSelfAssign: boolean,
 *   canUpdateStatus: boolean,
 *   canEditResolution: boolean,
 *   canComment: boolean,
 *   canCreateInternalNote: boolean,
 *   canCancel: boolean,
 *   canClose: boolean,
 *   canViewInternalContent: boolean,
 *   statusTransitions: ReadonlyArray<string>
 * }} Tập hợp các cờ quyền và danh sách trạng thái kế tiếp cho UI điều khiển hiển thị.
 */
export function getTicketPermissions(ticket, user) {
  const userId = referenceId(user?._id);
  // Xác định quan hệ giữa user hiện tại với ticket (người tạo / người được phân công)
  const isOwner = Boolean(userId) && referenceId(ticket?.createdBy) === userId;
  const isAssignee =
    Boolean(userId) && referenceId(ticket?.assignedTo) === userId;
  const isAdmin = user?.role === "admin";
  // Phân biệt bất kỳ kỹ thuật viên nào vs kỹ thuật viên trực tiếp phụ trách ticket này
  const isAnyTechnician = user?.role === "technician";
  const isTechnician = isAnyTechnician && isAssignee;
  const isUserOwner = user?.role === "user" && isOwner;
  const status = ticket?.status;
  const transitions = getStatusTransitions(status);

  return {
    isOwner,
    isAssignee,
    canAssign: (isAdmin || isAnyTechnician) && !TERMINAL_STATUSES.has(status),
    canSelfAssign:
      isAnyTechnician && !isAssignee && !TERMINAL_STATUSES.has(status),
    canUpdateStatus:
      (isAdmin || isTechnician) && transitions.length > 0,
    canEditResolution:
      isTechnician && ["in_progress", "waiting_user"].includes(status),
    canComment:
      (isUserOwner || isTechnician) &&
      !READ_ONLY_COMMENT_STATUSES.has(status),
    canCreateInternalNote:
      isTechnician && !READ_ONLY_COMMENT_STATUSES.has(status),
    // Người dùng thường chỉ được hủy trước khi kỹ thuật viên bắt đầu xử lý; Admin có quyền hủy rộng hơn
    canCancel:
      (isUserOwner && ["pending", "assigned"].includes(status)) ||
      (isAdmin &&
        ["pending", "assigned", "in_progress", "waiting_user"].includes(
          status,
        )),
    // Chỉ cho phép xác nhận đóng ticket sau khi đã được đánh dấu giải quyết (resolved)
    canClose:
      (isUserOwner || isAdmin || isAnyTechnician) && status === "resolved",
    canViewInternalContent: isAdmin || isTechnician,
    statusTransitions: transitions,
  };
}
