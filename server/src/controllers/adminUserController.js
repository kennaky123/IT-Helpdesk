import { unlink } from "node:fs/promises";
import { getUploadedFilePath } from "../config/upload.js";
import Ticket from "../models/Ticket.js";
import User from "../models/User.js";
import ApiError from "../utils/ApiError.js";

function serializeAdminUser(user, stats = { count: 0, recentTickets: [] }) {
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

async function getUserTicketStats(userId = null) {
  const filter = userId ? { createdBy: userId } : {};
  const tickets = await Ticket.find(filter)
    .select("ticketCode title status createdBy createdAt")
    .sort({ createdAt: -1, _id: -1 })
    .lean();

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

export async function listAdminUsers(_request, response, next) {
  try {
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

export async function createAdminUser(request, response, next) {
  try {
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

    return response.status(201).json({
      success: true,
      message: "Thêm tài khoản người dùng thành công.",
      data: { user: serializeAdminUser(user) },
    });
  } catch (error) {
    return next(error);
  }
}

export async function updateAdminUser(request, response, next) {
  try {
    const user = await User.findById(request.params.userId).select("+tokenVersion");
    if (!user) {
      throw new ApiError(404, "Không tìm thấy người dùng.");
    }

    if (user._id.equals(request.user._id)) {
      if (request.body.status !== "active") {
        throw new ApiError(400, "Không thể tự khóa tài khoản đang đăng nhập.");
      }
      if (request.body.role !== "admin") {
        throw new ApiError(400, "Không thể tự hạ vai trò quản trị viên đang đăng nhập.");
      }
    }

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
    if (request.body.password) {
      user.password = request.body.password;
      user.passwordChangedAt = new Date();
      user.tokenVersion = (user.tokenVersion ?? 0) + 1;
    } else if (request.body.status !== "active") {
      user.tokenVersion = (user.tokenVersion ?? 0) + 1;
    }

    await user.save();
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

export async function updateAdminUserStatus(request, response, next) {
  try {
    const user = await User.findById(request.params.userId).select("+tokenVersion");
    if (!user) {
      throw new ApiError(404, "Không tìm thấy người dùng.");
    }

    if (user._id.equals(request.user._id) && request.body.status !== "active") {
      throw new ApiError(400, "Không thể tự khóa tài khoản đang đăng nhập.");
    }

    user.status = request.body.status;
    if (request.body.status !== "active") {
      user.tokenVersion = (user.tokenVersion ?? 0) + 1;
    }
    await user.save();

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

export async function deleteAdminUser(request, response, next) {
  try {
    const user = await User.findById(request.params.userId);
    if (!user) {
      throw new ApiError(404, "Không tìm thấy người dùng.");
    }

    if (user._id.equals(request.user._id)) {
      throw new ApiError(400, "Không thể tự xóa tài khoản đang đăng nhập.");
    }

    const relatedTickets = await Ticket.exists({
      $or: [{ createdBy: user._id }, { assignedTo: user._id }],
    });
    if (relatedTickets) {
      throw new ApiError(
        409,
        "Không thể xóa tài khoản đã phát sinh ticket liên quan. Hãy khóa tài khoản thay thế.",
      );
    }

    await User.deleteOne({ _id: user._id });
    if (user.avatar) {
      try {
        await unlink(getUploadedFilePath(user.avatar));
      } catch {
        // Ảnh đại diện cũ có thể là URL ngoài hoặc đã bị dọn trước đó.
      }
    }

    return response.status(200).json({
      success: true,
      message: "Xóa tài khoản thành công.",
      data: { userId: String(user._id) },
    });
  } catch (error) {
    return next(error);
  }
}
