/**
 * @file ticketConversationService.js
 * @description Service xử lý nghiệp vụ lõi cho trao đổi bình luận (`Comment`), ghi chú nội bộ và lịch sử xử lý ticket.
 * Vai trò Service: Kiểm soát quyền xem/tạo nội dung nội bộ theo vai trò (`admin`, `technician` được phân công,
 * `user` tạo ticket), ẩn ghi chú phân công nhạy cảm khi hiển thị cho người dùng cuối, cập nhật mốc hoạt động
 * gần nhất (`lastActivityAt`) trên ticket và hợp nhất lịch sử trạng thái/phân công theo trình tự thời gian.
 */
import Comment from "../models/Comment.js";
import Ticket from "../models/Ticket.js";
import ApiError from "../utils/ApiError.js";

const personSelect = "fullName avatar role";

const commentResponseFields =
  "ticket sender content isInternal createdAt updatedAt " +
  "attachments.originalName attachments.mimeType attachments.sizeBytes " +
  "attachments.uploadedAt";

const statusHistoryPopulateOption = {
  path: "statusHistory.changedBy",
  select: personSelect,
};

const assignmentHistoryPopulateOptions = [
  {
    path: "assignmentHistory.fromTechnician",
    select: personSelect,
  },
  {
    path: "assignmentHistory.toTechnician",
    select: personSelect,
  },
  { path: "assignmentHistory.assignedBy", select: personSelect },
];

/**
 * Trích xuất chuỗi ID từ giá trị ObjectId hoặc subdocument đã populate.
 *
 * @param {string|Object|null|undefined} value - Giá trị cần lấy ID.
 * @returns {string|null} Chuỗi ID hoặc `null` nếu giá trị rỗng.
 */
function referenceId(value) {
  if (!value) {
    return null;
  }

  return String(value._id ?? value);
}

/**
 * Kiểm tra người dùng hiện tại có được phép xem ghi chú và lịch sử nội bộ của ticket hay không.
 * Chỉ Admin hoặc Kỹ thuật viên đang được phân công trực tiếp ticket mới có quyền này.
 *
 * @param {Object} user - Thông tin người dùng hiện tại.
 * @param {Object} ticket - Thông tin ticket đang truy cập.
 * @returns {boolean} `true` nếu được phép xem nội dung nội bộ.
 */
export function canViewInternalContent(user, ticket) {
  if (user.role === "admin") {
    return true;
  }

  const technicianId = referenceId(user._id);
  const assignedTechnicianId = referenceId(ticket?.assignedTo);

  return (
    user.role === "technician" &&
    Boolean(technicianId) &&
    assignedTechnicianId === technicianId
  );
}

/**
 * Tạo điều kiện lọc MongoDB cho danh sách comment dựa trên quyền xem nội dung nội bộ.
 *
 * @param {Object} user - Người dùng hiện tại.
 * @param {Object} ticket - Ticket đang truy cập.
 * @returns {Object} Bộ lọc `{}` (xem tất cả) hoặc `{ isInternal: false }` (chỉ xem công khai).
 */
export function buildCommentVisibilityFilter(user, ticket) {
  return canViewInternalContent(user, ticket)
    ? {}
    : { isInternal: false };
}

/**
 * Sắp xếp mảng sự kiện lịch sử theo thời điểm phát sinh (`occurredAt`) tăng dần,
 * sử dụng `_id` làm tiêu chí phụ để đảm bảo thứ tự ổn định khi trùng thời gian.
 *
 * @param {Array<Object>} items - Danh sách các sự kiện trạng thái và phân công.
 * @returns {Array<Object>} Bản sao mảng đã được sắp xếp theo trình tự thời gian.
 */
export function sortChronologically(items) {
  return [...items].sort((left, right) => {
    const timeDifference =
      new Date(left.occurredAt).getTime() -
      new Date(right.occurredAt).getTime();

    if (timeDifference !== 0) {
      return timeDifference;
    }

    return String(left._id).localeCompare(String(right._id));
  });
}

/**
 * Populate thông tin người gửi bình luận và loại bỏ `storageKey` nội bộ khỏi danh sách tệp đính kèm.
 *
 * @param {import("mongoose").Document} comment - Document `Comment` vừa tạo.
 * @returns {Promise<Object>} Đối tượng comment đã chuẩn hóa an toàn để trả về client.
 */
async function populateComment(comment) {
  await comment.populate({ path: "sender", select: personSelect });
  const returnedComment = comment.toObject();

  // Loại bỏ khóa lưu trữ nội bộ trên đĩa trước khi trả về client
  returnedComment.attachments = returnedComment.attachments.map(
    ({ storageKey: _storageKey, ...attachment }) => attachment,
  );

  return returnedComment;
}

/**
 * Xây dựng bộ lọc truy vấn kiểm tra quyền ghi bình luận hoặc ghi chú nội bộ lên ticket.
 * Chặn thao tác trên các ticket đã kết thúc (`closed` hoặc `cancelled`).
 *
 * @param {string|import("mongoose").Types.ObjectId} ticketId - ID ticket mục tiêu.
 * @param {Object} user - Người dùng thực hiện gửi nội dung.
 * @param {boolean} isInternal - `true` nếu là ghi chú nội bộ, `false` nếu là bình luận công khai.
 * @returns {Object} Điều kiện truy vấn MongoDB áp dụng cho `Ticket.findOneAndUpdate`.
 * @throws {ApiError} Lỗi 403 nếu vai trò không được phép tạo ghi chú nội bộ hoặc bình luận.
 */
export function buildCommentWriteFilter(ticketId, user, isInternal) {
  // Ghi chú nội bộ chỉ cho phép kỹ thuật viên đang trực tiếp xử lý ticket và ticket chưa đóng/hủy
  if (isInternal) {
    if (user.role !== "technician") {
      throw new ApiError(403, "Chỉ Technician được tạo ghi chú nội bộ.");
    }

    return {
      _id: ticketId,
      assignedTo: user._id,
      status: { $nin: ["closed", "cancelled"] },
    };
  }

  // Comment công khai chỉ cho phép người tạo ticket hoặc kỹ thuật viên đang được phân công
  if (!["user", "technician"].includes(user.role)) {
    throw new ApiError(403, "Vai trò không được phép gửi comment.");
  }

  return {
    _id: ticketId,
    status: { $nin: ["closed", "cancelled"] },
    $or: [{ createdBy: user._id }, { assignedTo: user._id }],
  };
}

/**
 * Tạo bình luận công khai hoặc ghi chú nội bộ mới trên ticket và cập nhật mốc `lastActivityAt`.
 *
 * @param {string|import("mongoose").Types.ObjectId} ticketId - ID ticket.
 * @param {Object} input - Nội dung bình luận (`{ content }`).
 * @param {Object} user - Người dùng thực hiện gửi.
 * @param {boolean} isInternal - Cờ đánh dấu ghi chú nội bộ.
 * @returns {Promise<Object>} Bình luận vừa tạo đã populate thông tin người gửi.
 * @throws {ApiError} Lỗi 404 nếu ticket không tồn tại, đã đóng/hủy hoặc người dùng không còn quyền gửi.
 */
export async function createTicketComment(ticketId, input, user, isInternal) {
  const now = new Date();
  // Kiểm tra quyền ghi đồng thời cập nhật nguyên tử mốc hoạt động gần nhất trên ticket
  const accessibleTicket = await Ticket.findOneAndUpdate(
    buildCommentWriteFilter(ticketId, user, isInternal),
    { $max: { lastActivityAt: now } },
    { new: false },
  ).select("_id");

  if (!accessibleTicket) {
    throw new ApiError(
      404,
      "Không tìm thấy ticket hoặc bạn không còn quyền gửi nội dung.",
    );
  }

  const comment = await Comment.create({
    ticket: ticketId,
    sender: user._id,
    content: input.content,
    isInternal,
  });

  return populateComment(comment);
}

/**
 * Lấy danh sách bình luận (có lọc ghi chú nội bộ theo quyền) và phân trang cho ticket.
 *
 * @param {string|import("mongoose").Types.ObjectId} ticketId - ID ticket.
 * @param {Object} user - Người dùng hiện tại.
 * @param {Object} ticket - Document ticket dùng để kiểm tra quyền xem nội bộ.
 * @param {Object} query - Tham số phân trang & sắp xếp (`page`, `limit`, `sortOrder`).
 * @returns {Promise<{comments: Array, pagination: Object}>} Danh sách comment và thông tin phân trang.
 */
export async function listTicketComments(ticketId, user, ticket, query) {
  const filter = {
    ticket: ticketId,
    ...buildCommentVisibilityFilter(user, ticket),
  };
  const skip = (query.page - 1) * query.limit;
  const sortDirection = query.sortOrder === "desc" ? -1 : 1;

  const [comments, totalItems] = await Promise.all([
    Comment.find(filter)
      .select(commentResponseFields)
      .populate({ path: "sender", select: personSelect })
      .sort({ createdAt: sortDirection, _id: sortDirection })
      .skip(skip)
      .limit(query.limit)
      .lean(),
    Comment.countDocuments(filter),
  ]);

  const totalPages = Math.ceil(totalItems / query.limit);

  return {
    comments,
    pagination: {
      page: query.page,
      limit: query.limit,
      totalItems,
      totalPages,
      hasPreviousPage: totalPages > 0 && query.page > 1,
      hasNextPage: query.page < totalPages,
    },
  };
}

/**
 * Chuẩn hóa một mục thay đổi trạng thái sang định dạng timeline thống nhất,
 * ẩn ghi chú chi tiết khi phân công nếu người xem không có quyền xem nội dung nội bộ.
 *
 * @param {Object} historyItem - Phần tử trong mảng `statusHistory` của ticket.
 * @param {boolean} [redactAssignmentNote=false] - Có che giấu ghi chú phân công nội bộ hay không.
 * @returns {Object} Sự kiện timeline loại `status_change`.
 */
function mapStatusHistory(historyItem, redactAssignmentNote = false) {
  return {
    _id: historyItem._id,
    type: "status_change",
    fromStatus: historyItem.fromStatus ?? null,
    toStatus: historyItem.toStatus,
    changedBy: historyItem.changedBy,
    changedAt: historyItem.changedAt,
    // Tránh lộ lý do hoặc thông tin phân công nội bộ cho người dùng cuối
    note:
      redactAssignmentNote && historyItem.toStatus === "assigned"
        ? "Ticket đã được phân công cho nhân viên kỹ thuật."
        : historyItem.note ?? null,
    occurredAt: historyItem.changedAt,
  };
}

/**
 * Chuẩn hóa một mục lịch sử phân công kỹ thuật viên sang định dạng timeline `assignment`.
 *
 * @param {Object} historyItem - Phần tử trong mảng `assignmentHistory` của ticket.
 * @returns {Object} Sự kiện timeline loại `assignment`.
 */
function mapAssignmentHistory(historyItem) {
  return {
    _id: historyItem._id,
    type: "assignment",
    fromTechnician: historyItem.fromTechnician ?? null,
    toTechnician: historyItem.toTechnician,
    assignedBy: historyItem.assignedBy,
    assignedAt: historyItem.assignedAt,
    reason: historyItem.reason ?? null,
    occurredAt: historyItem.assignedAt,
  };
}

/**
 * Lấy dòng thời gian lịch sử xử lý của ticket (gồm thay đổi trạng thái và phân công nếu đủ quyền).
 *
 * @param {string|import("mongoose").Types.ObjectId} ticketId - ID ticket.
 * @param {Object} user - Người dùng hiện tại.
 * @param {Object} accessTicket - Ticket đã nạp từ middleware kiểm tra quyền truy cập.
 * @returns {Promise<{ticketCode: string, history: Array}>} Mã ticket và mảng lịch sử đã sắp xếp theo thời gian.
 * @throws {ApiError} Lỗi 404 nếu không tìm thấy ticket.
 */
export async function getTicketHistory(ticketId, user, accessTicket) {
  // Chỉ Admin và Kỹ thuật viên được phân công mới lấy thêm assignmentHistory
  const includeInternalHistory = canViewInternalContent(user, accessTicket);
  const selectedFields = includeInternalHistory
    ? "ticketCode statusHistory assignmentHistory"
    : "ticketCode statusHistory";
  const populateOptions = includeInternalHistory
    ? [statusHistoryPopulateOption, ...assignmentHistoryPopulateOptions]
    : [statusHistoryPopulateOption];
  const ticket = await Ticket.findById(ticketId)
    .select(selectedFields)
    .populate(populateOptions)
    .lean();

  if (!ticket) {
    throw new ApiError(404, "Không tìm thấy ticket.");
  }

  // Hợp nhất lịch sử chuyển trạng thái và phân công rồi sắp xếp theo thứ tự thời gian tăng dần
  const history = [
    ...(ticket.statusHistory ?? []).map((historyItem) =>
      mapStatusHistory(historyItem, !includeInternalHistory),
    ),
    ...(includeInternalHistory ? ticket.assignmentHistory ?? [] : []).map(
      mapAssignmentHistory,
    ),
  ];

  return {
    ticketCode: ticket.ticketCode,
    history: sortChronologically(history),
  };
}
