/**
 * @file adminUserController.js
 * @description Controller quản lý tài khoản người dùng dành cho Quản trị viên (Admin).
 * Vai trò Controller: Tiếp nhận HTTP request từ các route quản trị tài khoản, thực hiện
 * kiểm tra nghiệp vụ, truy vấn/cập nhật dữ liệu người dùng và dọn dẹp liên kết khi xóa
 * (cascade delete), đồng thời phát sự kiện realtime và trả về JSON response chuẩn.
 */
import { unlink } from "node:fs/promises";
import { getUploadedFilePath } from "../config/upload.js";
import Asset from "../models/Asset.js";
import AssetRequest from "../models/AssetRequest.js";
import Comment from "../models/Comment.js";
import Rating from "../models/Rating.js";
import SoftwareLicense from "../models/SoftwareLicense.js";
import Ticket from "../models/Ticket.js";
import UsbDevice from "../models/UsbDevice.js";
import User from "../models/User.js";
import { publishDataChanged } from "../services/realtimeService.js";
import ApiError from "../utils/ApiError.js";

/**
 * Chuẩn hóa thông tin tài khoản người dùng kèm thống kê ticket để trả về cho Admin.
 *
 * @param {Object} user - Document Mongoose hoặc object thông tin người dùng.
 * @param {Object} [stats] - Thống kê số lượng ticket và danh sách ticket gần nhất.
 * @param {number} [stats.count=0] - Tổng số ticket người dùng đã tạo.
 * @param {Array} [stats.recentTickets=[]] - Tối đa 3 ticket gần nhất của người dùng.
 * @returns {Object} Đối tượng user đã chuẩn hóa (không chứa thông tin nhạy cảm).
 */
function serializeAdminUser(user, stats = { count: 0, recentTickets: [] }) {
  // Gọi toJSON() nếu là Mongoose document để áp dụng các transform ẩn trường nhạy cảm
  const plain = typeof user.toJSON === "function" ? user.toJSON() : user;
  return {
    _id: plain._id,
    fullName: plain.fullName,
    email: plain.email,
    phone: plain.phone,
    department: plain.department,
    avatar: plain.avatar ?? null,
    role: plain.role,
    status: plain.status,
    lastLoginAt: plain.lastLoginAt ?? null,
    createdAt: plain.createdAt,
    updatedAt: plain.updatedAt,
    ticketCount: Number(stats.count ?? 0),
    recentTickets: stats.recentTickets ?? [],
  };
}

/**
 * Truy vấn thống kê số ticket đã tạo và tối đa 3 ticket gần nhất theo từng người dùng.
 *
 * @param {string|import("mongoose").Types.ObjectId|null} [userId=null] - ID người dùng cần lọc (null để lấy tất cả).
 * @returns {Promise<Map<string, {count: number, recentTickets: Array}>>} Map ánh xạ userId -> thống kê ticket.
 */
async function getUserTicketStats(userId = null) {
  // Lọc theo người tạo nếu truyền userId cụ thể, ngược lại lấy toàn bộ ticket
  const filter = userId ? { createdBy: userId } : {};
  const tickets = await Ticket.find(filter)
    .select("ticketCode title status createdBy createdAt")
    .sort({ createdAt: -1, _id: -1 })
    .lean();

  // Gom nhóm số lượng ticket và giữ lại 3 ticket mới nhất cho mỗi tài khoản
  const statsMap = new Map();
  for (const ticket of tickets) {
    const key = String(ticket.createdBy);
    let entry = statsMap.get(key);
    if (!entry) {
      entry = { count: 0, recentTickets: [] };
      statsMap.set(key, entry);
    }
    entry.count += 1;
    if (entry.recentTickets.length < 3) {
      entry.recentTickets.push({
        _id: ticket._id,
        code: ticket.ticketCode,
        title: ticket.title,
        status: ticket.status,
      });
    }
  }
  return statsMap;
}

/**
 * Lấy danh sách toàn bộ tài khoản người dùng kèm thống kê ticket cho trang quản trị.
 *
 * @param {import("express").Request} _request - HTTP request (không sử dụng tham số đầu vào).
 * @param {import("express").Response} response - HTTP response trả về danh sách users.
 * @param {import("express").NextFunction} next - Middleware chuyển tiếp lỗi.
 * @returns {Promise<import("express").Response|void>} JSON response HTTP 200 chứa danh sách người dùng.
 */
export async function listAdminUsers(_request, response, next) {
  try {
    // Truy vấn song song danh sách user và thống kê ticket để tối ưu thời gian phản hồi
    const [users, statsMap] = await Promise.all([
      User.find()
        .select("fullName email phone department avatar role status lastLoginAt createdAt updatedAt")
        .sort({ createdAt: -1, _id: -1 })
        .lean(),
      getUserTicketStats(),
    ]);

    return response.status(200).json({
      success: true,
      message: "Lấy danh sách tài khoản thành công.",
      data: {
        users: users.map((user) =>
          serializeAdminUser(user, statsMap.get(String(user._id))),
        ),
      },
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Tạo mới tài khoản người dùng từ trang quản trị.
 *
 * @param {import("express").Request} request - HTTP request chứa thông tin tài khoản trong `body`.
 * @param {import("express").Response} response - HTTP response trả về thông tin user vừa tạo.
 * @param {import("express").NextFunction} next - Middleware chuyển tiếp lỗi.
 * @returns {Promise<import("express").Response|void>} JSON response HTTP 201 khi tạo thành công.
 */
export async function createAdminUser(request, response, next) {
  try {
    // Kiểm tra email đã tồn tại hay chưa trước khi tạo mới
    const existing = await User.exists({ email: request.body.email });
    if (existing) {
      throw new ApiError(409, "Email đã được sử dụng.");
    }

    const user = await User.create({
      fullName: request.body.fullName,
      email: request.body.email,
      password: request.body.password,
      phone: request.body.phone,
      department: request.body.department,
      role: request.body.role,
      status: request.body.status,
    });

    // Thông báo realtime cho các client đang theo dõi danh sách người dùng
    publishDataChanged("users");
    return response.status(201).json({
      success: true,
      message: "Thêm tài khoản người dùng thành công.",
      data: { user: serializeAdminUser(user) },
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Cập nhật thông tin, vai trò, trạng thái hoặc mật khẩu của tài khoản người dùng.
 *
 * @param {import("express").Request} request - HTTP request chứa `params.userId` và dữ liệu cập nhật trong `body`.
 * @param {import("express").Response} response - HTTP response trả về thông tin user sau khi cập nhật.
 * @param {import("express").NextFunction} next - Middleware chuyển tiếp lỗi.
 * @returns {Promise<import("express").Response|void>} JSON response HTTP 200 với dữ liệu user mới nhất.
 */
export async function updateAdminUser(request, response, next) {
  try {
    // Lấy kèm tokenVersion để có thể thu hồi phiên đăng nhập cũ khi cần
    const user = await User.findById(request.params.userId).select("+tokenVersion");
    if (!user) {
      throw new ApiError(404, "Không tìm thấy người dùng.");
    }

    // Bảo vệ an toàn: không cho phép Admin tự khóa hoặc tự hạ quyền của chính mình
    if (user._id.equals(request.user._id)) {
      if (request.body.status !== "active") {
        throw new ApiError(400, "Không thể tự khóa tài khoản đang đăng nhập.");
      }
      if (request.body.role !== "admin") {
        throw new ApiError(400, "Không thể tự hạ vai trò quản trị viên đang đăng nhập.");
      }
    }

    // Kiểm tra trùng email với các tài khoản khác trong hệ thống
    const duplicate = await User.exists({
      _id: { $ne: user._id },
      email: request.body.email,
    });
    if (duplicate) {
      throw new ApiError(409, "Email đã được sử dụng.");
    }

    user.fullName = request.body.fullName;
    user.email = request.body.email;
    user.phone = request.body.phone;
    user.department = request.body.department;
    user.role = request.body.role;
    user.status = request.body.status;

    // Nếu đổi mật khẩu hoặc khóa tài khoản, tăng tokenVersion để vô hiệu hóa toàn bộ JWT đang lưu hành
    if (request.body.password) {
      user.password = request.body.password;
      user.passwordChangedAt = new Date();
      user.tokenVersion = (user.tokenVersion ?? 0) + 1;
    } else if (request.body.status !== "active") {
      user.tokenVersion = (user.tokenVersion ?? 0) + 1;
    }

    await user.save();
    publishDataChanged("users");
    const statsMap = await getUserTicketStats(user._id);

    return response.status(200).json({
      success: true,
      message: "Cập nhật thông tin người dùng thành công.",
      data: {
        user: serializeAdminUser(user, statsMap.get(String(user._id))),
      },
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Khóa hoặc mở khóa nhanh trạng thái hoạt động (`active`/`inactive`) của tài khoản người dùng.
 *
 * @param {import("express").Request} request - HTTP request chứa `params.userId` và `body.status`.
 * @param {import("express").Response} response - HTTP response trả về trạng thái tài khoản mới.
 * @param {import("express").NextFunction} next - Middleware chuyển tiếp lỗi.
 * @returns {Promise<import("express").Response|void>} JSON response HTTP 200 sau khi cập nhật trạng thái.
 */
export async function updateAdminUserStatus(request, response, next) {
  try {
    const user = await User.findById(request.params.userId).select("+tokenVersion");
    if (!user) {
      throw new ApiError(404, "Không tìm thấy người dùng.");
    }

    // Ngăn Admin tự khóa tài khoản đang sử dụng
    if (user._id.equals(request.user._id) && request.body.status !== "active") {
      throw new ApiError(400, "Không thể tự khóa tài khoản đang đăng nhập.");
    }

    user.status = request.body.status;
    // Khi tài khoản bị vô hiệu hóa, tăng tokenVersion để ép đăng xuất mọi phiên hiện tại
    if (request.body.status !== "active") {
      user.tokenVersion = (user.tokenVersion ?? 0) + 1;
    }
    await user.save();
    publishDataChanged("users");

    const statsMap = await getUserTicketStats(user._id);
    return response.status(200).json({
      success: true,
      message:
        user.status === "inactive"
          ? "Đã khóa tài khoản người dùng."
          : "Đã mở khóa tài khoản người dùng.",
      data: {
        user: serializeAdminUser(user, statsMap.get(String(user._id))),
      },
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Xóa tài khoản người dùng và thực hiện dọn dẹp dữ liệu liên quan (cascade delete & unlink).
 * Quy trình gồm: thu hồi tài sản đang cấp phát, gỡ liên kết bản quyền/USB/yêu cầu cấp phát,
 * xóa bình luận/đánh giá/ticket do user tạo và xóa tệp ảnh đại diện vật lý nếu có.
 *
 * @param {import("express").Request} request - HTTP request chứa `params.userId` cần xóa.
 * @param {import("express").Response} response - HTTP response xác nhận đã xóa tài khoản.
 * @param {import("express").NextFunction} next - Middleware chuyển tiếp lỗi.
 * @returns {Promise<import("express").Response|void>} JSON response HTTP 200 chứa `userId` vừa xóa.
 */
export async function deleteAdminUser(request, response, next) {
  try {
    const user = await User.findById(request.params.userId);
    if (!user) {
      throw new ApiError(404, "Không tìm thấy người dùng.");
    }

    // Không cho phép tự xóa tài khoản quản trị đang đăng nhập
    if (user._id.equals(request.user._id)) {
      throw new ApiError(400, "Không thể tự xóa tài khoản đang đăng nhập.");
    }

    // Bước 1 (Cascade Asset): Thu hồi toàn bộ thiết bị đang cấp phát cho user về kho và ghi nhận lịch sử
    const assignedAssets = await Asset.find({ assignedTo: user._id });
    for (const asset of assignedAssets) {
      asset.status = "in_stock";
      asset.assignedTo = null;
      asset.assignedAt = null;
      asset.history.push({
        action: "returned",
        user: user._id,
        performedBy: request.user._id,
        note: `Tự động thu hồi về kho khi xóa tài khoản ${user.fullName}.`,
      });
      await asset.save();
    }

    // Bước 2 (Cascade AssetRequest / Software / USB): Xóa yêu cầu cấp phát và gỡ tham chiếu user khỏi bản quyền, thiết bị USB
    await Promise.all([
      AssetRequest.deleteMany({ employee: user._id }),
      AssetRequest.updateMany(
        { technician: user._id },
        { $set: { technician: null } },
      ),
      SoftwareLicense.updateMany(
        { "assignedUsers.user": user._id },
        { $pull: { assignedUsers: { user: user._id } } },
      ),
      UsbDevice.updateMany(
        { assignedUser: user._id },
        { $set: { assignedUser: null } },
      ),
    ]);

    // Bước 3 (Cascade Ticket / Comment / Rating): Lấy các ticket do user tạo để xóa sạch comment/rating phụ thuộc
    const createdTickets = await Ticket.find({ createdBy: user._id })
      .select("_id")
      .lean();
    const createdTicketIds = createdTickets.map((ticket) => ticket._id);

    await Promise.all([
      Comment.deleteMany({
        $or: [
          { sender: user._id },
          ...(createdTicketIds.length ? [{ ticket: { $in: createdTicketIds } }] : []),
        ],
      }),
      Rating.deleteMany({
        $or: [
          { ratedBy: user._id },
          { technician: user._id },
          ...(createdTicketIds.length ? [{ ticket: { $in: createdTicketIds } }] : []),
        ],
      }),
      // Gỡ phân công ở các ticket mà user này đóng vai trò kỹ thuật viên xử lý
      Ticket.updateMany(
        { assignedTo: user._id },
        { $set: { assignedTo: null } },
      ),
    ]);

    // Bước 4: Xóa các ticket do user này tạo sau khi đã dọn comment và rating liên quan
    if (createdTicketIds.length > 0) {
      await Ticket.deleteMany({ _id: { $in: createdTicketIds } });
    }

    // Bước 5: Xóa bản ghi user trong DB và dọn tệp ảnh đại diện trên đĩa (nếu có)
    await User.deleteOne({ _id: user._id });
    if (user.avatar) {
      try {
        await unlink(getUploadedFilePath(user.avatar));
      } catch {
        // Ảnh đại diện cũ có thể là URL ngoài hoặc đã bị dọn trước đó.
      }
    }

    // Phát sự kiện realtime cho tất cả các module bị ảnh hưởng bởi thao tác cascade delete
    publishDataChanged("users");
    publishDataChanged("assets");
    publishDataChanged("software");
    publishDataChanged("tickets");

    return response.status(200).json({
      success: true,
      message: "Xóa tài khoản thành công.",
      data: { userId: String(user._id) },
    });
  } catch (error) {
    return next(error);
  }
}
