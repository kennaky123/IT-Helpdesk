/**
 * @file ticketService.js
 * @description Service xử lý nghiệp vụ lõi toàn bộ vòng đời Ticket hỗ trợ CNTT.
 * Vai trò Service: Sinh mã ticket tuần tự theo năm Việt Nam (`HD-YYYY-NNNNNN`) qua bộ đếm nguyên tử
 * `TicketCounter`, áp dụng phạm vi phân quyền theo vai trò, quản lý tệp đính kèm, điều phối
 * luồng chuyển trạng thái hợp lệ kèm ghi nhận các mốc thời gian SLA (`assignedAt`, `startedAt`,
 * `waitingUserAt`, `resolvedAt`, `closedAt`, `cancelledAt`) và lưu vết `statusHistory`/`assignmentHistory`.
 */
import { access } from "node:fs/promises";
import {
  TERMINAL_TICKET_STATUSES,
  USER_CANCELLABLE_STATUSES,
  canTechnicianTransition,
} from "../constants/ticket.js";
import { getUploadedFilePath } from "../config/upload.js";
import Category from "../models/Category.js";
import Ticket from "../models/Ticket.js";
import TicketCounter from "../models/TicketCounter.js";
import User from "../models/User.js";
import ApiError from "../utils/ApiError.js";

const ticketSummaryPopulateOptions = [
  { path: "category", select: "name slug isActive" },
  {
    path: "createdBy",
    select: "fullName email department avatar role status",
  },
  {
    path: "assignedTo",
    select: "fullName email department avatar role status",
  },
];

const ticketDetailPopulateOptions = [
  ...ticketSummaryPopulateOptions,
  { path: "cancelledBy", select: "fullName email role" },
];

/**
 * Thoát các ký tự đặc biệt trong chuỗi tìm kiếm trước khi tạo RegExp truy vấn MongoDB.
 *
 * @param {string} value - Chuỗi đầu vào cần escape.
 * @returns {string} Chuỗi đã thoát ký tự đặc biệt regex.
 */
function escapeRegularExpression(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Lấy năm dương lịch hiện tại theo múi giờ Việt Nam (`Asia/Ho_Chi_Minh`) để đánh số mã ticket.
 *
 * @param {Date} [date=new Date()] - Thời điểm tham chiếu.
 * @returns {number} Năm 4 chữ số theo múi giờ Việt Nam.
 */
function getVietnamYear(date = new Date()) {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      timeZone: "Asia/Ho_Chi_Minh",
    }).format(date),
  );
}

/**
 * Định dạng cặp năm và số thứ tự thành mã ticket chuẩn `HD-YYYY-NNNNNN`.
 *
 * @param {number} year - Năm tạo ticket (1000..9999).
 * @param {number} sequence - Số thứ tự tăng dần trong năm (1..999999).
 * @returns {string} Mã ticket định dạng `HD-YYYY-NNNNNN`.
 * @throws {ApiError} Lỗi 500 nếu năm hoặc số thứ tự vượt phạm vi hợp lệ.
 */
export function formatTicketCode(year, sequence) {
  if (
    !Number.isInteger(year) ||
    year < 1000 ||
    year > 9999 ||
    !Number.isInteger(sequence) ||
    sequence < 1 ||
    sequence > 999_999
  ) {
    throw new ApiError(500, "Không thể tạo mã ticket hợp lệ.");
  }

  return `HD-${year}-${String(sequence).padStart(6, "0")}`;
}

/**
 * Tăng bộ đếm mã ticket theo năm trong collection `TicketCounter` một cách an toàn trước đồng thời.
 * Tự động xử lý trường hợp xung đột khóa trùng (`11000`) khi khởi tạo bản ghi đầu tiên của năm mới.
 *
 * @param {number} year - Năm hiện tại cần tăng bộ đếm.
 * @returns {Promise<import("mongoose").Document|null>} Document `TicketCounter` sau khi đã tăng `sequence`.
 */
async function incrementTicketCounter(year) {
  const counterId = `ticket:${year}`;

  try {
    // Upsert nguyên tử bộ đếm của năm hiện tại
    return await TicketCounter.findOneAndUpdate(
      { _id: counterId },
      {
        $inc: { sequence: 1 },
        $setOnInsert: { year },
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
      },
    );
  } catch (error) {
    if (error.code !== 11000) {
      throw error;
    }

    // Nếu 2 request đồng thời cùng cố upsert ở lượt đầu tiên gây lỗi 11000, thử lại bằng cập nhật trực tiếp
    return TicketCounter.findByIdAndUpdate(
      counterId,
      { $inc: { sequence: 1 } },
      { new: true, runValidators: true },
    );
  }
}

/**
 * Sinh mã ticket duy nhất theo năm hiện tại tại Việt Nam bằng cách tăng bộ đếm `TicketCounter`.
 *
 * @returns {Promise<string>} Mã ticket mới (ví dụ: `HD-2026-000001`).
 * @throws {ApiError} Lỗi 500 nếu không tăng được bộ đếm.
 */
async function generateTicketCode() {
  const year = getVietnamYear();
  const counter = await incrementTicketCounter(year);

  if (!counter) {
    throw new ApiError(500, "Không thể tăng bộ đếm mã ticket.");
  }

  return formatTicketCode(year, counter.sequence);
}

/**
 * Xác định điều kiện lọc phạm vi truy cập ticket theo vai trò người dùng.
 *
 * @param {Object} user - Người dùng đang thực hiện truy vấn.
 * @returns {Object} Bộ lọc MongoDB (`{}` cho Admin/Technician, `{ createdBy: user._id }` cho User).
 * @throws {ApiError} Lỗi 403 nếu vai trò không hợp lệ.
 */
function buildRoleScope(user) {
  if (user.role === "admin" || user.role === "technician") {
    return {};
  }

  if (user.role === "user") {
    return { createdBy: user._id };
  }

  throw new ApiError(403, "Vai trò không được phép truy cập ticket.");
}

/**
 * Chuẩn hóa đối tượng ticket trước khi trả về client: loại bỏ thông tin lưu trữ tệp nội bộ
 * và lược bỏ các mảng lịch sử chi tiết (được cung cấp qua endpoint lịch sử riêng).
 *
 * @param {Object} ticket - Document `Ticket` hoặc object thuần.
 * @returns {Object} Đối tượng ticket đã được làm sạch cho API response.
 */
export function serializeTicketForClient(ticket) {
  const returnedTicket =
    typeof ticket.toObject === "function" ? ticket.toObject() : { ...ticket };

  // Ẩn storageKey và uploadedBy khỏi metadata tệp đính kèm
  returnedTicket.attachments = (returnedTicket.attachments ?? []).map(
    ({ storageKey: _storageKey, uploadedBy: _uploadedBy, ...attachment }) =>
      attachment,
  );
  delete returnedTicket.statusHistory;
  delete returnedTicket.assignmentHistory;

  return returnedTicket;
}

/**
 * Populate đầy đủ thông tin tham chiếu cho ticket chi tiết và chuẩn hóa output cho client.
 *
 * @param {import("mongoose").Document} ticket - Document `Ticket`.
 * @returns {Promise<Object>} Đối tượng ticket chi tiết đã populate và serialize.
 */
async function populateTicket(ticket) {
  await ticket.populate(ticketDetailPopulateOptions);
  return serializeTicketForClient(ticket);
}

/**
 * Tìm ticket theo ID với điều kiện kỹ thuật viên hiện tại phải là người được phân công xử lý.
 *
 * @param {string|import("mongoose").Types.ObjectId} ticketId - ID ticket.
 * @param {string|import("mongoose").Types.ObjectId} technicianId - ID kỹ thuật viên.
 * @returns {Promise<import("mongoose").Document>} Document `Ticket` tìm thấy.
 * @throws {ApiError} Lỗi 404 nếu không tìm thấy hoặc ticket chưa được gán cho kỹ thuật viên này.
 */
async function findAssignedTicket(ticketId, technicianId) {
  const ticket = await Ticket.findOne({
    _id: ticketId,
    assignedTo: technicianId,
  });

  if (!ticket) {
    throw new ApiError(404, "Không tìm thấy ticket được phân công.");
  }

  return ticket;
}

/**
 * Tạo ticket hỗ trợ mới (có thể kèm tệp đính kèm và chỉ định sẵn kỹ thuật viên).
 * Tự động sinh mã `HD-YYYY-NNNNNN`, khởi tạo trạng thái (`pending` hoặc `assigned`)
 * và ghi lại lịch sử trạng thái/phân công ban đầu.
 *
 * @param {Object} input - Dữ liệu tạo ticket (`title`, `description`, `category`, `priority`, `technicianId`).
 * @param {Object} user - Người dùng tạo ticket.
 * @param {Array<Object>} [files=[]] - Danh sách tệp đính kèm do Multer xử lý.
 * @returns {Promise<Object>} Ticket mới đã populate thông tin chi tiết.
 * @throws {ApiError} Lỗi 400 nếu danh mục hoặc kỹ thuật viên chỉ định không hợp lệ.
 */
export async function createTicket(input, user, files = []) {
  // Xác minh danh mục tồn tại và đang hoạt động
  const categoryExists = await Category.exists({
    _id: input.category,
    isActive: true,
  });

  if (!categoryExists) {
    throw new ApiError(400, "Danh mục không tồn tại hoặc đã bị vô hiệu hóa.");
  }

  // Nếu người tạo chỉ định trước kỹ thuật viên, kiểm tra tài khoản kỹ thuật viên phải đang active
  let assignedTechnician = null;
  if (input.technicianId) {
    assignedTechnician = await User.findOne({
      _id: input.technicianId,
      role: "technician",
      status: "active",
    });

    if (!assignedTechnician) {
      throw new ApiError(
        400,
        "Kỹ thuật viên được phân công không tồn tại hoặc không hoạt động.",
      );
    }
  }

  // Sinh mã ticket tăng dần theo năm và chuẩn bị metadata tệp đính kèm
  const ticketCode = await generateTicketCode();
  const now = new Date();
  const attachments = files.map((file) => ({
    originalName: file.originalname,
    storageKey: file.filename,
    mimeType: file.mimetype,
    sizeBytes: file.size,
    uploadedBy: user._id,
    uploadedAt: now,
  }));

  // Khởi tạo trạng thái và lịch sử chuyển trạng thái ban đầu (nếu phân công ngay thì thêm bước pending -> assigned)
  const initialStatus = assignedTechnician ? "assigned" : "pending";
  const statusHistory = [
    {
      fromStatus: null,
      toStatus: "pending",
      changedBy: user._id,
      note: "Ticket được tạo.",
      changedAt: now,
    },
  ];

  const assignmentHistory = [];
  if (assignedTechnician) {
    statusHistory.push({
      fromStatus: "pending",
      toStatus: "assigned",
      changedBy: user._id,
      note: `Phân công trực tiếp cho kỹ thuật viên ${assignedTechnician.fullName}.`,
      changedAt: now,
    });
    assignmentHistory.push({
      fromTechnician: null,
      toTechnician: assignedTechnician._id,
      assignedBy: user._id,
      reason: "Chỉ định kỹ thuật viên khi tạo ticket.",
      assignedAt: now,
    });
  }

  const ticket = await Ticket.create({
    ticketCode,
    title: input.title,
    description: input.description,
    category: input.category,
    priority: input.priority,
    createdBy: user._id,
    assignedTo: assignedTechnician ? assignedTechnician._id : null,
    assignedAt: assignedTechnician ? now : null,
    attachments,
    status: initialStatus,
    lastActivityAt: now,
    statusHistory,
    assignmentHistory,
  });

  return populateTicket(ticket);
}

/**
 * Lấy danh sách ticket có tìm kiếm, lọc đa tiêu chí, phân quyền theo vai trò và phân trang.
 *
 * @param {Object} query - Bộ lọc truy vấn (`search`, `status`, `statuses`, `priority`, `category`, `technician`, `sortOrder`, `page`, `limit`).
 * @param {Object} user - Người dùng thực hiện truy vấn.
 * @returns {Promise<{tickets: Array, pagination: Object}>} Danh sách ticket tóm tắt kèm thông tin phân trang.
 */
export async function listTickets(query, user) {
  const filter = {};

  // Hỗ trợ tìm theo tiền tố mã ticket (không phân biệt hoa thường nhờ chuyển hoa) hoặc tiêu đề
  if (query.search) {
    const escapedSearch = escapeRegularExpression(query.search);
    const escapedCodeSearch = escapeRegularExpression(
      query.search.toUpperCase(),
    );

    filter.$or = [
      { ticketCode: { $regex: `^${escapedCodeSearch}` } },
      { title: { $regex: escapedSearch, $options: "i" } },
    ];
  }

  if (query.status) {
    filter.status = query.status;
  } else if (query.statuses?.length > 0) {
    filter.status = { $in: query.statuses };
  }

  if (query.priority) {
    filter.priority = query.priority;
  }

  if (query.category) {
    filter.category = query.category;
  }

  if (query.technician) {
    filter.assignedTo = query.technician;
  }

  // Giới hạn kết quả theo phạm vi vai trò (User chỉ thấy ticket của bản thân)
  Object.assign(filter, buildRoleScope(user));

  const sortDirection = query.sortOrder === "asc" ? 1 : -1;
  const skip = (query.page - 1) * query.limit;

  const [tickets, totalItems] = await Promise.all([
    Ticket.find(filter)
      .select(
        "ticketCode title category priority status createdBy assignedTo " +
          "assignedAt startedAt waitingUserAt resolvedAt closedAt cancelledAt " +
          "lastActivityAt createdAt updatedAt",
      )
      .populate(ticketSummaryPopulateOptions)
      .sort({ createdAt: sortDirection, _id: sortDirection })
      .skip(skip)
      .limit(query.limit)
      .lean(),
    Ticket.countDocuments(filter),
  ]);

  const totalPages = Math.ceil(totalItems / query.limit);

  return {
    tickets,
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
 * Lấy thông tin chi tiết của một ticket theo ID trong phạm vi quyền xem của người dùng.
 *
 * @param {string|import("mongoose").Types.ObjectId} ticketId - ID ticket cần xem.
 * @param {Object} user - Người dùng hiện tại.
 * @returns {Promise<Object>} Đối tượng ticket chi tiết đã populate và chuẩn hóa.
 * @throws {ApiError} Lỗi 404 nếu không tìm thấy ticket hoặc không đủ quyền xem.
 */
export async function getTicketById(ticketId, user) {
  const ticket = await Ticket.findOne({
    _id: ticketId,
    ...buildRoleScope(user),
  }).populate(ticketDetailPopulateOptions);

  if (!ticket) {
    throw new ApiError(404, "Không tìm thấy ticket hoặc bạn không có quyền xem.");
  }

  return serializeTicketForClient(ticket);
}

/**
 * Truy xuất thông tin và đường dẫn vật lý của tệp đính kèm trên ticket sau khi xác minh quyền truy cập.
 *
 * @param {string|import("mongoose").Types.ObjectId} ticketId - ID ticket chứa tệp đính kèm.
 * @param {string} attachmentId - ID subdocument tệp đính kèm.
 * @param {Object} user - Người dùng yêu cầu tải/xem tệp.
 * @returns {Promise<{filePath: string, originalName: string, mimeType: string}>} Đường dẫn và metadata tệp hợp lệ.
 * @throws {ApiError} Lỗi 404 nếu không thấy ticket, tệp đính kèm hoặc tệp vật lý đã bị xóa trên đĩa.
 */
export async function getTicketAttachment(
  ticketId,
  attachmentId,
  user,
) {
  const ticket = await Ticket.findOne({
    _id: ticketId,
    ...buildRoleScope(user),
  }).select("attachments");

  if (!ticket) {
    throw new ApiError(404, "Không tìm thấy ticket hoặc bạn không có quyền xem.");
  }

  const attachment = ticket.attachments.id(attachmentId);

  if (!attachment) {
    throw new ApiError(404, "Không tìm thấy tệp đính kèm.");
  }

  // Xác minh tệp thực sự tồn tại trên ổ đĩa trước khi chuyển sang sendFile
  const filePath = getUploadedFilePath(attachment.storageKey);

  try {
    await access(filePath);
  } catch {
    throw new ApiError(404, "Tệp đính kèm không còn tồn tại trên máy chủ.");
  }

  return {
    filePath,
    originalName: attachment.originalName,
    mimeType: attachment.mimeType,
  };
}

/**
 * Phân công hoặc điều chuyển kỹ thuật viên phụ trách xử lý ticket.
 * Ghi nhận mốc `assignedAt`, `lastActivityAt` và đẩy bản ghi vào `assignmentHistory` & `statusHistory`.
 *
 * @param {string|import("mongoose").Types.ObjectId} ticketId - ID ticket.
 * @param {Object} input - Gồm `{ technicianId, reason }`.
 * @param {Object} actor - Người thực hiện phân công (Admin hoặc Technician tự nhận việc).
 * @returns {Promise<Object>} Ticket sau khi phân công đã populate.
 * @throws {ApiError} Lỗi 404/400/409 nếu không thấy ticket/kỹ thuật viên, ticket đã kết thúc hoặc phân công trùng.
 */
export async function assignTechnician(ticketId, input, actor) {
  const [ticket, technician] = await Promise.all([
    Ticket.findById(ticketId),
    User.findOne({
      _id: input.technicianId,
      role: "technician",
      status: "active",
    }),
  ]);

  if (!ticket) {
    throw new ApiError(404, "Không tìm thấy ticket.");
  }

  if (!technician) {
    throw new ApiError(400, "Technician không tồn tại hoặc không hoạt động.");
  }

  // Không cho phép phân công ticket đã đóng, đã giải quyết hoặc đã hủy
  if (TERMINAL_TICKET_STATUSES.includes(ticket.status)) {
    throw new ApiError(400, "Không thể phân công ticket đã kết thúc.");
  }

  if (ticket.assignedTo?.equals(technician._id)) {
    throw new ApiError(409, "Ticket đã được phân công cho Technician này.");
  }

  const now = new Date();
  const previousStatus = ticket.status;
  const previousTechnician = ticket.assignedTo;

  // Cập nhật kỹ thuật viên, mốc thời gian phân công SLA và lịch sử phân công
  ticket.assignedTo = technician._id;
  ticket.assignedAt = now;
  ticket.status = "assigned";
  ticket.lastActivityAt = now;
  ticket.assignmentHistory.push({
    fromTechnician: previousTechnician,
    toTechnician: technician._id,
    assignedBy: actor._id,
    reason: input.reason,
    assignedAt: now,
  });

  // Chỉ thêm mục chuyển trạng thái nếu ticket trước đó chưa ở trạng thái "assigned"
  if (previousStatus !== "assigned") {
    ticket.statusHistory.push({
      fromStatus: previousStatus,
      toStatus: "assigned",
      changedBy: actor._id,
      note:
        actor.role === "technician" && actor._id.equals(technician._id)
          ? "Kỹ thuật viên đã tiếp nhận ticket."
          : "Ticket đã được phân công cho nhân viên kỹ thuật.",
      changedAt: now,
    });
  }

  await ticket.save();
  return populateTicket(ticket);
}

/**
 * Chuyển đổi trạng thái xử lý của ticket theo máy trạng thái cho phép (`canTechnicianTransition`),
 * đồng thời cập nhật các mốc thời gian SLA (`startedAt`, `waitingUserAt`, `resolvedAt`) và ghi `statusHistory`.
 *
 * @param {string|import("mongoose").Types.ObjectId} ticketId - ID ticket.
 * @param {Object} input - Gồm `{ status, resolution, note }`.
 * @param {Object} actor - Admin hoặc Kỹ thuật viên được phân công ticket.
 * @returns {Promise<Object>} Ticket sau khi đổi trạng thái đã populate.
 * @throws {ApiError} Lỗi 404/400 nếu không thấy ticket, chuyển trạng thái sai luồng hoặc thiếu `resolution` khi `resolved`.
 */
export async function updateTicketStatus(ticketId, input, actor) {
  // Admin được phép cập nhật mọi ticket; kỹ thuật viên chỉ cập nhật được ticket phân công cho mình
  const ticket =
    actor.role === "admin"
      ? await Ticket.findById(ticketId)
      : await findAssignedTicket(ticketId, actor._id);

  if (!ticket) {
    throw new ApiError(404, "Không tìm thấy ticket.");
  }

  // Kiểm tra tính hợp lệ của bước chuyển trạng thái theo cấu hình vòng đời ticket
  if (!canTechnicianTransition(ticket.status, input.status)) {
    throw new ApiError(
      400,
      `Không thể chuyển trạng thái từ ${ticket.status} sang ${input.status}.`,
    );
  }

  const now = new Date();
  const previousStatus = ticket.status;

  // Khi đánh dấu đã giải quyết (resolved), bắt buộc phải có nội dung hướng dẫn giải quyết và lưu mốc resolvedAt tính SLA
  if (input.status === "resolved") {
    const resolution = input.resolution || ticket.resolution;

    if (!resolution) {
      throw new ApiError(
        400,
        "Phải nhập nội dung giải quyết trước khi hoàn thành ticket.",
      );
    }

    ticket.resolution = resolution;
    ticket.resolvedAt = now;
  }

  // Ghi nhận thời điểm bắt đầu xử lý thực tế (chỉ ghi lần đầu tiên chuyển sang in_progress)
  if (input.status === "in_progress" && !ticket.startedAt) {
    ticket.startedAt = now;
  }

  // Ghi nhận mốc thời gian chuyển sang chờ phản hồi người dùng
  if (input.status === "waiting_user") {
    ticket.waitingUserAt = now;
  }

  ticket.status = input.status;
  ticket.lastActivityAt = now;
  ticket.statusHistory.push({
    fromStatus: previousStatus,
    toStatus: input.status,
    changedBy: actor._id,
    note: input.note,
    changedAt: now,
  });

  await ticket.save();
  return populateTicket(ticket);
}

/**
 * Cập nhật trước nội dung giải pháp (`resolution`) trong khi kỹ thuật viên đang xử lý ticket.
 *
 * @param {string|import("mongoose").Types.ObjectId} ticketId - ID ticket.
 * @param {string} resolution - Nội dung cách giải quyết sự cố.
 * @param {Object} technician - Kỹ thuật viên được phân công.
 * @returns {Promise<Object>} Ticket đã cập nhật nội dung giải quyết.
 * @throws {ApiError} Lỗi 400 nếu ticket không ở trạng thái `in_progress` hoặc `waiting_user`.
 */
export async function updateTicketResolution(ticketId, resolution, technician) {
  const ticket = await findAssignedTicket(ticketId, technician._id);

  if (!["in_progress", "waiting_user"].includes(ticket.status)) {
    throw new ApiError(
      400,
      "Chỉ được nhập cách giải quyết khi ticket đang được xử lý.",
    );
  }

  ticket.resolution = resolution;
  ticket.lastActivityAt = new Date();
  await ticket.save();

  return populateTicket(ticket);
}

/**
 * Hủy ticket kèm lý do hủy; Admin được phép hủy ở các trạng thái chưa kết thúc,
 * trong khi người dùng chỉ được hủy ở các trạng thái thuộc `USER_CANCELLABLE_STATUSES`.
 *
 * @param {string|import("mongoose").Types.ObjectId} ticketId - ID ticket.
 * @param {string} reason - Lý do hủy ticket.
 * @param {Object} user - Người dùng hoặc Admin thực hiện hủy.
 * @returns {Promise<Object>} Ticket ở trạng thái `cancelled` đã populate.
 * @throws {ApiError} Lỗi 404/400 nếu không thấy ticket hoặc trạng thái hiện tại không cho phép hủy.
 */
export async function cancelTicket(ticketId, reason, user) {
  const ticket = await Ticket.findOne(
    user.role === "admin"
      ? { _id: ticketId }
      : { _id: ticketId, createdBy: user._id },
  );

  if (!ticket) {
    throw new ApiError(404, "Không tìm thấy ticket của bạn.");
  }

  // Phân tách danh sách trạng thái được phép hủy theo vai trò Admin hay User
  const cancellableStatuses =
    user.role === "admin"
      ? ["pending", "assigned", "in_progress", "waiting_user"]
      : USER_CANCELLABLE_STATUSES;

  if (!cancellableStatuses.includes(ticket.status)) {
    throw new ApiError(
      400,
      "Không thể hủy ticket ở trạng thái hiện tại.",
    );
  }

  const now = new Date();
  const previousStatus = ticket.status;

  ticket.status = "cancelled";
  ticket.cancelledAt = now;
  ticket.cancelledBy = user._id;
  ticket.cancellationReason = reason;
  ticket.lastActivityAt = now;
  ticket.statusHistory.push({
    fromStatus: previousStatus,
    toStatus: "cancelled",
    changedBy: user._id,
    note: reason || `${user.role === "admin" ? "Admin" : "User"} hủy ticket.`,
    changedAt: now,
  });

  await ticket.save();
  return populateTicket(ticket);
}

/**
 * Xác nhận đóng hoàn toàn một ticket đã được giải quyết (`resolved` -> `closed`).
 *
 * @param {string|import("mongoose").Types.ObjectId} ticketId - ID ticket.
 * @param {string} note - Ghi chú đóng ticket (tùy chọn).
 * @param {Object} actor - Admin, người tạo ticket hoặc kỹ thuật viên được phân công.
 * @returns {Promise<Object>} Ticket ở trạng thái `closed` đã populate.
 * @throws {ApiError} Lỗi 404 nếu không thấy/không có quyền hoặc 400 nếu ticket chưa ở trạng thái `resolved`.
 */
export async function closeTicket(ticketId, note, actor) {
  const ticket = await Ticket.findOne(
    actor.role === "admin"
      ? { _id: ticketId }
      : {
          _id: ticketId,
          $or: [{ createdBy: actor._id }, { assignedTo: actor._id }],
        },
  );

  if (!ticket) {
    throw new ApiError(404, "Không tìm thấy ticket hoặc bạn không có quyền đóng.");
  }

  if (ticket.status !== "resolved") {
    throw new ApiError(400, "Chỉ được đóng ticket đã được giải quyết.");
  }

  const now = new Date();
  ticket.status = "closed";
  ticket.closedAt = now;
  ticket.lastActivityAt = now;
  ticket.statusHistory.push({
    fromStatus: "resolved",
    toStatus: "closed",
    changedBy: actor._id,
    note: note || "Ticket đã được xác nhận đóng.",
    changedAt: now,
  });

  await ticket.save();
  return populateTicket(ticket);
}
