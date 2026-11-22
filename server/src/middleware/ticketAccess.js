/**
 * @file ticketAccess.js
 * @description Tập hợp các helper và middleware kiểm soát quyền truy cập Ticket và Ghi chú nội bộ (Internal Note).
 * Vai trò trong kiến trúc Backend:
 * - Đảm bảo người dùng thường chỉ truy cập được ticket do mình tạo hoặc được phân công,
 *   trong khi Admin và Technician có phạm vi truy cập theo đúng nghiệp vụ.
 * - Gắn `request.ticket` cho các controller con (ví dụ: comment, attachment) nhằm tránh truy vấn lặp lại.
 */
import Ticket from "../models/Ticket.js";
import ApiError from "../utils/ApiError.js";

/**
 * Chuẩn hóa giá trị ID tham chiếu (có thể là chuỗi ID thô hoặc object đã populate có `_id`) thành chuỗi.
 * @param {string|{ _id?: string }|null|undefined} value - Giá trị cần lấy ID.
 * @returns {string|null} Chuỗi ID hoặc `null` nếu đầu vào rỗng.
 */
function referenceId(value) {
  if (!value) {
    return null;
  }

  return String(value._id ?? value);
}

/**
 * Kiểm tra xem người dùng `user` có quyền xem/tham gia vào `ticket` hay không.
 * Luồng xử lý:
 * - Admin và Technician luôn được phép truy cập ticket.
 * - Người dùng thường (`user`) chỉ hợp lệ khi là người tạo (`createdBy`) hoặc người được giao (`assignedTo`).
 * @param {{ createdBy?: *, assignedTo?: * }|null} ticket - Thông tin ticket cần kiểm tra.
 * @param {{ _id?: *, role?: string }|null} user - Thông tin người dùng hiện tại.
 * @returns {boolean} `true` nếu có quyền tham gia ticket, ngược lại `false`.
 */
export function isTicketParticipant(ticket, user) {
  if (!ticket || !user) {
    return false;
  }

  // Admin và Technician có quyền xem và hỗ trợ xử lý toàn bộ ticket trong hệ thống
  if (user.role === "admin" || user.role === "technician") {
    return true;
  }

  const userId = referenceId(user._id);
  const creatorId = referenceId(ticket.createdBy);
  const assignedTechnicianId = referenceId(ticket.assignedTo);

  if (!userId) {
    return false;
  }

  return (
    creatorId === userId ||
    assignedTechnicianId === userId
  );
}

/**
 * Xây dựng bộ lọc truy vấn Database theo `ticketId` có ràng buộc quyền sở hữu/phụ trách của `user`.
 * @param {string} ticketId - ID của ticket mục tiêu.
 * @param {{ _id: string, role: string }} user - Thông tin người dùng đang thực hiện truy vấn.
 * @returns {Object} Đối tượng filter dùng cho `Ticket.findOne(...)`.
 */
export function buildTicketAccessFilter(ticketId, user) {
  if (user.role === "admin" || user.role === "technician") {
    return { _id: ticketId };
  }

  // Giới hạn truy vấn ở tầng DB để user thường chỉ lấy được ticket liên quan tới chính mình
  return {
    _id: ticketId,
    $or: [{ createdBy: user._id }, { assignedTo: user._id }],
  };
}

/**
 * Middleware xác nhận ticket tồn tại và người dùng hiện tại có quyền truy cập vào ticket đó.
 * Luồng xử lý: Truy vấn `Ticket.findOne` kết hợp `buildTicketAccessFilter`; nếu không tìm thấy
 * (hoặc không có quyền) thì trả về 404 để tránh rò rỉ thông tin tồn tại của ticket; nếu hợp lệ
 * thì gắn `request.ticket` và gọi `next()`.
 * @param {import("express").Request & { user?: *, ticket?: * }} request - Đối tượng HTTP request.
 * @param {import("express").Response} _response - Đối tượng HTTP response (không dùng).
 * @param {import("express").NextFunction} next - Hàm chuyển tiếp middleware.
 * @returns {Promise<void>}
 */
export async function requireTicketParticipantOrAdmin(
  request,
  _response,
  next,
) {
  try {
    const ticket = await Ticket.findOne(
      buildTicketAccessFilter(request.params.ticketId, request.user),
    )
      .select("ticketCode createdBy assignedTo status")
      .lean();

    if (!ticket) {
      throw new ApiError(
        404,
        "Không tìm thấy ticket hoặc bạn không có quyền truy cập nội dung.",
      );
    }

    // Lưu bản ghi ticket rút gọn vào request để các handler sau tái sử dụng
    request.ticket = ticket;
    return next();
  } catch (error) {
    return next(error);
  }
}

/**
 * Middleware kiểm tra quyền tạo ghi chú nội bộ (Internal Note) trên một ticket.
 * Luồng xử lý: Chỉ cho phép tài khoản có vai trò `technician` và đang được phân công trực tiếp
 * trên `request.ticket.assignedTo`; các trường hợp khác bị từ chối với HTTP 403.
 * @param {import("express").Request & { user: *, ticket?: * }} request - Đối tượng HTTP request.
 * @param {import("express").Response} _response - Đối tượng HTTP response (không dùng).
 * @param {import("express").NextFunction} next - Hàm chuyển tiếp middleware.
 * @returns {void}
 */
export function authorizeInternalNote(request, _response, next) {
  const technicianId = referenceId(request.user._id);
  const assignedTechnicianId = referenceId(request.ticket?.assignedTo);
  // Xác minh đúng Technician đang phụ trách ticket mới được viết ghi chú nội bộ
  const isAssignedTechnician =
    request.user.role === "technician" &&
    Boolean(technicianId) &&
    assignedTechnicianId === technicianId;

  if (!isAssignedTechnician) {
    return next(
      new ApiError(
        403,
        "Chỉ Technician đang được phân công mới có thể tạo ghi chú nội bộ.",
      ),
    );
  }

  return next();
}
