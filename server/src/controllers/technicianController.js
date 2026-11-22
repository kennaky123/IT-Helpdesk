/**
 * @file technicianController.js
 * @description Controller quản lý danh sách và tài khoản Kỹ thuật viên (Technician).
 * Vai trò Controller: Tiếp nhận HTTP request lấy danh sách kỹ thuật viên khả dụng cho phân công,
 * truy vấn thống kê hiệu suất (số ticket đang xử lý, đã hoàn thành, điểm đánh giá trung bình)
 * và thực hiện CRUD tài khoản kỹ thuật viên trên model `User`, trả về JSON response chuẩn.
 */
import User from "../models/User.js";
import { unlink } from "node:fs/promises";
import { getUploadedFilePath } from "../config/upload.js";
import Ticket from "../models/Ticket.js";
import Rating from "../models/Rating.js";
import ApiError from "../utils/ApiError.js";

const ACTIVE_TICKET_STATUSES = ["assigned", "in_progress", "waiting_user"];
const COMPLETED_TICKET_STATUSES = ["resolved", "closed"];

/**
 * Chuẩn hóa đối tượng kỹ thuật viên kèm trạng thái bận/rảnh/ngoại tuyến và số liệu hiệu suất.
 *
 * @param {Object} user - Thông tin tài khoản kỹ thuật viên (từ DB).
 * @param {Object} [statistics={}] - Số liệu thống kê ticket và điểm đánh giá trung bình.
 * @returns {Object} Đối tượng kỹ thuật viên đã định dạng cho client.
 */
function serializeTechnician(user, statistics = {}) {
  const active = Number(statistics.active ?? 0);
  const accountIsActive = user.status === "active";

  return {
    _id: user._id,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone,
    specialization: user.department,
    avatar: user.avatar,
    accountStatus: user.status,
    // Suy ra trạng thái làm việc: khóa tài khoản -> offline, đang có ticket -> busy, rảnh -> online
    status: accountIsActive ? (active > 0 ? "busy" : "online") : "offline",
    active,
    completed: Number(statistics.completed ?? 0),
    // Làm tròn điểm đánh giá trung bình đến 1 chữ số thập phân (hoặc null nếu chưa có đánh giá)
    rating:
      statistics.averageRating == null
        ? null
        : Math.round(Number(statistics.averageRating) * 10) / 10,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

/**
 * Tổng hợp số lượng ticket đang xử lý, ticket đã hoàn thành và điểm đánh giá trung bình cho từng kỹ thuật viên.
 *
 * @returns {Promise<Map<string, {active?: number, completed?: number, averageRating?: number}>>} Map thống kê theo technicianId.
 */
async function getTechnicianStatistics() {
  // Chạy song song 2 pipeline aggregation trên Ticket và Rating để giảm độ trễ truy vấn
  const [ticketRows, ratingRows] = await Promise.all([
    Ticket.aggregate([
      { $match: { assignedTo: { $ne: null } } },
      {
        $group: {
          _id: "$assignedTo",
          active: {
            $sum: { $cond: [{ $in: ["$status", ACTIVE_TICKET_STATUSES] }, 1, 0] },
          },
          completed: {
            $sum: { $cond: [{ $in: ["$status", COMPLETED_TICKET_STATUSES] }, 1, 0] },
          },
        },
      },
    ]),
    Rating.aggregate([
      { $group: { _id: "$technician", averageRating: { $avg: "$score" } } },
    ]),
  ]);
  const statistics = new Map(
    ticketRows.map((row) => [String(row._id), { ...row }]),
  );

  // Gộp điểm đánh giá trung bình vào Map thống kê theo từng kỹ thuật viên
  for (const row of ratingRows) {
    const key = String(row._id);
    statistics.set(key, { ...statistics.get(key), averageRating: row.averageRating });
  }

  return statistics;
}

/**
 * Lấy danh sách kỹ thuật viên đang hoạt động (`status: "active"`) để chọn phân công xử lý ticket.
 *
 * @param {import("express").Request} _request - HTTP request (không sử dụng).
 * @param {import("express").Response} response - HTTP response trả về danh sách kỹ thuật viên hoạt động.
 * @param {import("express").NextFunction} next - Middleware chuyển tiếp lỗi.
 * @returns {Promise<import("express").Response|void>} JSON response HTTP 200.
 */
export async function listActiveTechnicians(_request, response, next) {
  try {
    const technicians = await User.find({
      role: "technician",
      status: "active",
    })
      .select("fullName email department avatar status")
      .sort({ fullName: 1, _id: 1 })
      .lean();

    return response.status(200).json({
      success: true,
      message: "Lấy danh sách nhân viên kỹ thuật thành công.",
      data: { technicians },
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Lấy danh sách toàn bộ kỹ thuật viên kèm số liệu thống kê khối lượng công việc và rating cho Admin.
 *
 * @param {import("express").Request} _request - HTTP request (không sử dụng).
 * @param {import("express").Response} response - HTTP response trả về danh sách kỹ thuật viên quản trị.
 * @param {import("express").NextFunction} next - Middleware chuyển tiếp lỗi.
 * @returns {Promise<import("express").Response|void>} JSON response HTTP 200.
 */
export async function listAdminTechnicians(_request, response, next) {
  try {
    // Truy vấn đồng thời danh sách tài khoản kỹ thuật viên và bản đồ thống kê hiệu suất
    const [technicians, statistics] = await Promise.all([
      User.find({ role: "technician" })
        .select("fullName email phone department avatar status createdAt updatedAt")
        .sort({ createdAt: -1, _id: -1 })
        .lean(),
      getTechnicianStatistics(),
    ]);

    return response.status(200).json({
      success: true,
      message: "Lấy danh sách kỹ thuật viên thành công.",
      data: {
        technicians: technicians.map((user) =>
          serializeTechnician(user, statistics.get(String(user._id))),
        ),
      },
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Tạo mới tài khoản kỹ thuật viên từ màn hình quản trị.
 *
 * @param {import("express").Request} request - HTTP request chứa thông tin kỹ thuật viên trong `body`.
 * @param {import("express").Response} response - HTTP response trả về kỹ thuật viên vừa tạo.
 * @param {import("express").NextFunction} next - Middleware chuyển tiếp lỗi.
 * @returns {Promise<import("express").Response|void>} JSON response HTTP 201.
 */
export async function createTechnician(request, response, next) {
  try {
    const existingUser = await User.exists({ email: request.body.email });
    if (existingUser) throw new ApiError(409, "Email đã được sử dụng.");

    // Lưu chuyên môn vào trường department và ánh xạ trạng thái "offline" sang "inactive"
    const user = await User.create({
      fullName: request.body.fullName,
      email: request.body.email,
      password: request.body.password,
      phone: request.body.phone,
      department: request.body.specialization,
      role: "technician",
      status: request.body.status === "offline" ? "inactive" : "active",
    });

    return response.status(201).json({
      success: true,
      message: "Thêm kỹ thuật viên thành công.",
      data: { technician: serializeTechnician(user.toObject()) },
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Cập nhật thông tin hồ sơ, chuyên môn, trạng thái hoặc mật khẩu của kỹ thuật viên.
 *
 * @param {import("express").Request} request - HTTP request chứa `params.technicianId` và dữ liệu cập nhật.
 * @param {import("express").Response} response - HTTP response trả về kỹ thuật viên kèm thống kê mới nhất.
 * @param {import("express").NextFunction} next - Middleware chuyển tiếp lỗi.
 * @returns {Promise<import("express").Response|void>} JSON response HTTP 200.
 */
export async function updateTechnician(request, response, next) {
  try {
    const user = await User.findOne({ _id: request.params.technicianId, role: "technician" });
    if (!user) throw new ApiError(404, "Không tìm thấy kỹ thuật viên.");

    // Kiểm tra email cập nhật không trùng với người dùng khác
    const duplicateEmail = await User.exists({
      _id: { $ne: user._id },
      email: request.body.email,
    });
    if (duplicateEmail) throw new ApiError(409, "Email đã được sử dụng.");

    user.fullName = request.body.fullName;
    user.email = request.body.email;
    user.phone = request.body.phone;
    user.department = request.body.specialization;
    user.status = request.body.status === "offline" ? "inactive" : "active";
    if (request.body.password) user.password = request.body.password;
    await user.save();

    const statistics = await getTechnicianStatistics();
    return response.status(200).json({
      success: true,
      message: "Cập nhật kỹ thuật viên thành công.",
      data: { technician: serializeTechnician(user.toObject(), statistics.get(String(user._id))) },
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Xóa tài khoản kỹ thuật viên (chặn xóa nếu đã có ticket từng được phân công hoặc tạo bởi người này).
 *
 * @param {import("express").Request} request - HTTP request chứa `params.technicianId`.
 * @param {import("express").Response} response - HTTP response xác nhận xóa thành công.
 * @param {import("express").NextFunction} next - Middleware chuyển tiếp lỗi.
 * @returns {Promise<import("express").Response|void>} JSON response HTTP 200 chứa `technicianId`.
 */
export async function deleteTechnician(request, response, next) {
  try {
    const user = await User.findOne({ _id: request.params.technicianId, role: "technician" });
    if (!user) throw new ApiError(404, "Không tìm thấy kỹ thuật viên.");

    // Bảo toàn lịch sử xử lý ticket: không xóa kỹ thuật viên nếu đã gắn với bất kỳ ticket nào
    const relatedTickets = await Ticket.exists({
      $or: [{ assignedTo: user._id }, { createdBy: user._id }],
    });
    if (relatedTickets) {
      throw new ApiError(409, "Không thể xóa kỹ thuật viên đã có ticket liên quan. Hãy đặt tài khoản ở trạng thái ngoại tuyến.");
    }

    await User.deleteOne({ _id: user._id });
    if (user.avatar) {
      try {
        await unlink(getUploadedFilePath(user.avatar));
      } catch {
        // Avatar có thể là URL bên ngoài hoặc file đã được dọn trước đó.
      }
    }
    return response.status(200).json({
      success: true,
      message: "Xóa kỹ thuật viên thành công.",
      data: { technicianId: String(user._id) },
    });
  } catch (error) {
    return next(error);
  }
}
