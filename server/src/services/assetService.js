/**
 * @file assetService.js
 * @description Service xử lý nghiệp vụ lõi cho quản lý tài sản/thiết bị CNTT (`Asset`) và yêu cầu cấp phát (`AssetRequest`).
 * Vai trò Service: Thực hiện truy vấn cơ sở dữ liệu, kiểm tra ràng buộc nghiệp vụ,
 * cấp phát và thu hồi thiết bị an toàn (atomic update), tự động giải phóng bản quyền phần mềm
 * khi nhân viên trả hết thiết bị, sinh mã yêu cầu cấp phát tuần tự và ghi nhận lịch sử vòng đời.
 */
import Asset from "../models/Asset.js";
import AssetRequest from "../models/AssetRequest.js";
import SoftwareLicense from "../models/SoftwareLicense.js";
import TicketCounter from "../models/TicketCounter.js";
import User from "../models/User.js";
import ApiError from "../utils/ApiError.js";

const personSelect = "fullName email department phone role status avatar";

const assetPopulate = [
  { path: "assignedTo", select: personSelect },
  { path: "history.user", select: "fullName email" },
  { path: "history.performedBy", select: "fullName role" },
];

const requestPopulate = [
  { path: "employee", select: personSelect },
  { path: "requestedBy", select: "fullName role" },
  { path: "technician", select: "fullName email" },
  { path: "asset", select: "assetTag name type status" },
];

/**
 * Thoát các ký tự đặc biệt trong chuỗi trước khi đưa vào biểu thức chính quy MongoDB `$regex`.
 *
 * @param {string} value - Chuỗi tìm kiếm thô từ người dùng.
 * @returns {string} Chuỗi đã được escape an toàn cho RegExp.
 */
function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Tìm nhân viên hoặc kỹ thuật viên đang ở trạng thái hoạt động (`active`) để cấp phát thiết bị.
 *
 * @param {string|import("mongoose").Types.ObjectId} userId - ID của nhân viên cần kiểm tra.
 * @returns {Promise<import("mongoose").Document>} Document User hợp lệ.
 * @throws {ApiError} Lỗi 400 nếu nhân viên không tồn tại, sai vai trò hoặc tài khoản bị khóa.
 */
async function findActiveEmployee(userId) {
  const employee = await User.findOne({
    _id: userId,
    role: { $in: ["user", "technician"] },
    status: "active",
  });

  if (!employee) {
    throw new ApiError(400, "Nhân viên không tồn tại hoặc đã bị khóa.");
  }

  return employee;
}

/* ----------------------------- Thiết bị (Asset) ----------------------------- */

/**
 * Lấy danh sách thiết bị theo bộ lọc tìm kiếm và quyền hạn người dùng, kèm thống kê tổng hợp theo trạng thái.
 *
 * @param {Object} query - Bộ lọc truy vấn (`assignedTo`, `status`, `type`, `search`).
 * @param {Object} user - Người dùng hiện tại thực hiện yêu cầu.
 * @returns {Promise<{assets: Array, summary: Object}>} Danh sách thiết bị và số lượng thống kê theo trạng thái.
 */
export async function listAssets(query, user) {
  const filter = {};

  // Người dùng thường chỉ được xem các thiết bị đang được cấp phát cho chính mình
  if (user.role === "user") {
    filter.assignedTo = user._id;
  } else if (query.assignedTo) {
    filter.assignedTo = query.assignedTo;
  }

  if (query.status) filter.status = query.status;
  if (query.type) filter.type = query.type;

  // Nếu có từ khóa tìm kiếm, tìm khớp cả mã thiết bị, tên, số serial và tên nhân viên đang giữ máy
  if (query.search) {
    const pattern = { $regex: escapeRegex(query.search), $options: "i" };
    const matchedUsers = await User.find({ fullName: pattern }).select("_id").lean();
    filter.$or = [
      { assetTag: pattern },
      { name: pattern },
      { serialNumber: pattern },
      { assignedTo: { $in: matchedUsers.map((item) => item._id) } },
    ];
  }

  // Truy vấn song song danh sách thiết bị (ẩn mảng history để nhẹ payload) và thống kê số lượng theo status
  const [assets, summaryRows] = await Promise.all([
    Asset.find(filter)
      .select("-history")
      .populate({ path: "assignedTo", select: personSelect })
      .sort({ updatedAt: -1, _id: -1 })
      .lean(),
    Asset.aggregate([
      ...(user.role === "user" ? [{ $match: { assignedTo: user._id } }] : []),
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
  ]);

  // Chuẩn hóa bộ đếm tổng hợp cho tất cả trạng thái tài sản
  const summary = { total: 0, in_stock: 0, in_use: 0, maintenance: 0, retired: 0 };
  for (const row of summaryRows) {
    summary[row._id] = row.count;
    summary.total += row.count;
  }

  return { assets, summary };
}

/**
 * Lấy thông tin chi tiết một thiết bị kèm toàn bộ lịch sử cấp phát/thu hồi/cập nhật.
 *
 * @param {string|import("mongoose").Types.ObjectId} assetId - ID thiết bị cần xem.
 * @param {Object} user - Người dùng hiện tại (kiểm tra phạm vi quyền xem nếu là `user`).
 * @returns {Promise<import("mongoose").Document>} Document thiết bị đã populate thông tin liên quan.
 * @throws {ApiError} Lỗi 404 nếu không tìm thấy thiết bị hoặc không có quyền xem.
 */
export async function getAsset(assetId, user) {
  const asset = await Asset.findOne({
    _id: assetId,
    ...(user.role === "user" && { assignedTo: user._id }),
  }).populate(assetPopulate);

  if (!asset) throw new ApiError(404, "Không tìm thấy thiết bị.");
  return asset;
}

/**
 * Nhập mới một thiết bị vào kho và khởi tạo bản ghi lịch sử đầu tiên.
 *
 * @param {Object} input - Thông tin thiết bị cần tạo (`assetTag`, `name`, `type`, `status`,...).
 * @param {Object} actor - Tài khoản quản trị/kỹ thuật viên thực hiện nhập kho.
 * @returns {Promise<import("mongoose").Document>} Thiết bị vừa tạo đã populate.
 * @throws {ApiError} Lỗi 409 nếu mã `assetTag` đã tồn tại.
 */
export async function createAsset(input, actor) {
  const exists = await Asset.exists({ assetTag: input.assetTag.toUpperCase() });
  if (exists) throw new ApiError(409, "Mã thiết bị (Asset Tag) đã tồn tại.");

  // Không cho phép tạo thiết bị ở trạng thái "in_use" trực tiếp; bắt buộc qua quy trình cấp phát
  const asset = await Asset.create({
    ...input,
    status: input.status === "in_use" ? "in_stock" : input.status,
    history: [{ action: "created", performedBy: actor._id, note: "Nhập kho thiết bị mới." }],
  });

  return asset.populate(assetPopulate);
}

/**
 * Cập nhật thông tin thiết bị và ghi nhật ký thay đổi vào mảng `history`.
 *
 * @param {string|import("mongoose").Types.ObjectId} assetId - ID thiết bị cần cập nhật.
 * @param {Object} input - Dữ liệu cập nhật (không bao gồm thao tác cấp phát/thu hồi `in_use`).
 * @param {Object} actor - Tài khoản thực hiện chỉnh sửa.
 * @returns {Promise<import("mongoose").Document>} Thiết bị sau cập nhật đã populate.
 * @throws {ApiError} Lỗi 404 nếu không thấy thiết bị, 409 nếu trùng Asset Tag, 400 nếu đổi trạng thái `in_use` trái quy trình.
 */
export async function updateAsset(assetId, input, actor) {
  const asset = await Asset.findById(assetId);
  if (!asset) throw new ApiError(404, "Không tìm thấy thiết bị.");

  // Kiểm tra trùng mã Asset Tag nếu người dùng sửa đổi mã định danh
  if (input.assetTag && input.assetTag.toUpperCase() !== asset.assetTag) {
    const duplicated = await Asset.exists({
      assetTag: input.assetTag.toUpperCase(),
      _id: { $ne: asset._id },
    });
    if (duplicated) throw new ApiError(409, "Mã thiết bị (Asset Tag) đã tồn tại.");
  }

  const { status, ...fields } = input;
  Object.assign(asset, fields);

  // Tách riêng xử lý thay đổi trạng thái; chặn chuyển qua/từ "in_use" bằng form chỉnh sửa thông thường
  if (status && status !== asset.status) {
    if (asset.status === "in_use" || status === "in_use") {
      throw new ApiError(
        400,
        "Dùng chức năng Cấp phát / Thu hồi để thay đổi trạng thái đang sử dụng.",
      );
    }
    asset.history.push({
      action: "status_changed",
      performedBy: actor._id,
      note: `Chuyển trạng thái: ${asset.status} → ${status}`,
    });
    asset.status = status;
  } else {
    asset.history.push({ action: "updated", performedBy: actor._id, note: "Cập nhật thông tin thiết bị." });
  }

  await asset.save();
  return asset.populate(assetPopulate);
}

/**
 * Xóa thiết bị khỏi hệ thống sau khi xác nhận thiết bị không đang được nhân viên sử dụng.
 *
 * @param {string|import("mongoose").Types.ObjectId} assetId - ID thiết bị cần xóa.
 * @returns {Promise<void>}
 * @throws {ApiError} Lỗi 404 nếu không thấy thiết bị hoặc 400 nếu thiết bị đang ở trạng thái `in_use`.
 */
export async function deleteAsset(assetId) {
  const asset = await Asset.findById(assetId).select("status");
  if (!asset) throw new ApiError(404, "Không tìm thấy thiết bị.");
  if (asset.status === "in_use") {
    throw new ApiError(400, "Không thể xóa thiết bị đang được nhân viên sử dụng. Hãy thu hồi trước.");
  }
  await asset.deleteOne();
}

/**
 * Cấp phát thiết bị đang ở trạng thái Trong kho (`in_stock`) cho nhân viên hợp lệ.
 * Sử dụng `findOneAndUpdate` nguyên tử để tránh cấp phát trùng khi có thao tác đồng thời.
 *
 * @param {string|import("mongoose").Types.ObjectId} assetId - ID thiết bị cần cấp phát.
 * @param {Object} payload - Thông tin cấp phát gồm `{ userId, note }`.
 * @param {Object} actor - Tài khoản thực hiện cấp phát.
 * @returns {Promise<import("mongoose").Document>} Thiết bị sau cấp phát đã populate.
 * @throws {ApiError} Lỗi 409 nếu thiết bị không tồn tại hoặc không còn trong kho.
 */
export async function assignAsset(assetId, { userId, note }, actor) {
  const employee = await findActiveEmployee(userId);
  const now = new Date();

  // Cập nhật nguyên tử điều kiện status === "in_stock" để ngăn race condition cấp phát cùng lúc
  const asset = await Asset.findOneAndUpdate(
    { _id: assetId, status: "in_stock" },
    {
      $set: { status: "in_use", assignedTo: employee._id, assignedAt: now },
      $push: {
        history: {
          action: "assigned",
          user: employee._id,
          performedBy: actor._id,
          note: note || `Cấp phát cho ${employee.fullName}.`,
          at: now,
        },
      },
    },
    { new: true },
  );

  if (!asset) {
    throw new ApiError(409, "Thiết bị không tồn tại hoặc không còn ở trạng thái Trong kho.");
  }

  return asset.populate(assetPopulate);
}

/**
 * Thu hồi thiết bị đang cấp phát (`in_use`) về kho hoặc chuyển sang bảo trì (`maintenance`).
 * Nếu nhân viên bị thu hồi không còn thiết bị nào khác đang sử dụng, tự động thu hồi toàn bộ
 * bản quyền phần mềm đang gán cho nhân viên đó.
 *
 * @param {string|import("mongoose").Types.ObjectId} assetId - ID thiết bị cần thu hồi.
 * @param {Object} payload - Thông tin thu hồi gồm `{ note, status = "in_stock" }`.
 * @param {Object} actor - Tài khoản thực hiện thu hồi.
 * @returns {Promise<import("mongoose").Document>} Thiết bị sau thu hồi đã populate.
 * @throws {ApiError} Lỗi 404 nếu không thấy thiết bị hoặc 400 nếu thiết bị không ở trạng thái `in_use`.
 */
export async function returnAsset(assetId, { note, status = "in_stock" }, actor) {
  const asset = await Asset.findById(assetId);
  if (!asset) throw new ApiError(404, "Không tìm thấy thiết bị.");
  if (asset.status !== "in_use") {
    throw new ApiError(400, "Thiết bị hiện không được cấp phát cho nhân viên nào.");
  }

  // Ghi nhận lịch sử thu hồi trước khi xóa liên kết assignedTo
  const previousUser = asset.assignedTo;
  asset.history.push({
    action: "returned",
    user: previousUser,
    performedBy: actor._id,
    note: note || (status === "maintenance" ? "Thu hồi để bảo trì." : "Thu hồi về kho."),
  });
  asset.status = status;
  asset.assignedTo = null;
  asset.assignedAt = null;

  await asset.save();

  // Đồng bộ liên kết bản quyền phần mềm: nếu nhân viên không còn giữ thiết bị công ty nào thì tự động rút license
  if (previousUser) {
    const stillHasActiveAsset = await Asset.exists({
      assignedTo: previousUser,
      status: "in_use",
    });

    if (!stillHasActiveAsset) {
      const affectedLicenses = await SoftwareLicense.find({
        "assignedUsers.user": previousUser,
      });
      const prevUserIdStr = String(previousUser);
      await Promise.all(
        affectedLicenses.map(async (license) => {
          const nextAssigned = (license.assignedUsers || []).filter(
            (entry) => String(entry.user?._id ?? entry.user) !== prevUserIdStr,
          );
          if (nextAssigned.length !== (license.assignedUsers || []).length) {
            license.assignedUsers = nextAssigned;
            license.updatedBy = actor._id;
            await license.save();
          }
        }),
      );
    }
  }

  return asset.populate(assetPopulate);
}

/**
 * Lấy danh sách nhân viên và kỹ thuật viên đang hoạt động để phục vụ chọn đối tượng cấp phát thiết bị.
 *
 * @returns {Promise<Array>} Danh sách nhân viên sắp xếp theo tên tăng dần.
 */
export async function listAssignableEmployees() {
  return User.find({ role: { $in: ["user", "technician"] }, status: "active" })
    .select("fullName email department role")
    .sort({ fullName: 1 })
    .lean();
}

/* ------------------------ Yêu cầu cấp phát (Request) ------------------------ */

/**
 * Sinh mã yêu cầu cấp phát thiết bị duy nhất theo năm dạng `AR-YYYY-NNNN` dựa trên `TicketCounter`.
 *
 * @returns {Promise<string>} Mã yêu cầu cấp phát vừa được cấp số tăng dần.
 */
async function generateRequestCode() {
  const year = new Date().getFullYear();
  const counter = await TicketCounter.findOneAndUpdate(
    { _id: `asset-request:${year}` },
    { $inc: { sequence: 1 }, $setOnInsert: { year } },
    { new: true, upsert: true },
  );
  return `AR-${year}-${String(counter.sequence).padStart(4, "0")}`;
}

/**
 * Lấy danh sách yêu cầu cấp phát thiết bị, tự động giới hạn theo nhân viên nếu là `user`.
 *
 * @param {Object} query - Bộ lọc truy vấn (`status`).
 * @param {Object} user - Người dùng hiện tại.
 * @returns {Promise<Array>} Danh sách yêu cầu cấp phát đã populate, mới nhất lên đầu.
 */
export async function listAssetRequests(query, user) {
  const filter = {};
  if (user.role === "user") filter.employee = user._id;
  if (query.status) filter.status = query.status;

  return AssetRequest.find(filter)
    .populate(requestPopulate)
    .sort({ createdAt: -1, _id: -1 })
    .lean();
}

/**
 * Tạo mới yêu cầu cấp phát thiết bị; tự chuyển sang trạng thái `in_progress` nếu chỉ định sẵn kỹ thuật viên.
 *
 * @param {Object} input - Thông tin yêu cầu (`employeeId`, `assetType`, `note`, `technicianId`).
 * @param {Object} actor - Người tạo yêu cầu.
 * @returns {Promise<import("mongoose").Document>} Yêu cầu cấp phát vừa tạo đã populate.
 * @throws {ApiError} Lỗi 400 nếu nhân viên hoặc kỹ thuật viên được chọn không hợp lệ.
 */
export async function createAssetRequest(input, actor) {
  await findActiveEmployee(input.employeeId);

  // Xác minh kỹ thuật viên phụ trách nếu yêu cầu được gán trực tiếp
  if (input.technicianId) {
    const technician = await User.exists({
      _id: input.technicianId,
      role: "technician",
      status: "active",
    });
    if (!technician) throw new ApiError(400, "Kỹ thuật viên không tồn tại hoặc không hoạt động.");
  }

  const request = await AssetRequest.create({
    requestCode: await generateRequestCode(),
    employee: input.employeeId,
    assetType: input.assetType,
    note: input.note,
    requestedBy: actor._id,
    technician: input.technicianId || null,
    status: input.technicianId ? "in_progress" : "pending",
    acceptedAt: input.technicianId ? new Date() : null,
  });

  return request.populate(requestPopulate);
}

/**
 * Kỹ thuật viên tiếp nhận xử lý yêu cầu cấp phát đang chờ (`pending` -> `in_progress`).
 *
 * @param {string|import("mongoose").Types.ObjectId} requestId - ID yêu cầu cấp phát.
 * @param {Object} actor - Tài khoản kỹ thuật viên tiếp nhận.
 * @returns {Promise<import("mongoose").Document>} Yêu cầu đã chuyển sang `in_progress`.
 * @throws {ApiError} Lỗi 409 nếu yêu cầu không tồn tại hoặc đã có người khác tiếp nhận.
 */
export async function acceptAssetRequest(requestId, actor) {
  const request = await AssetRequest.findOneAndUpdate(
    { _id: requestId, status: "pending" },
    { $set: { status: "in_progress", technician: actor._id, acceptedAt: new Date() } },
    { new: true },
  );

  if (!request) throw new ApiError(409, "Yêu cầu không tồn tại hoặc đã có người tiếp nhận.");
  return request.populate(requestPopulate);
}

/**
 * Hoàn tất yêu cầu cấp phát bằng cách gán thiết bị trong kho cho nhân viên yêu cầu.
 *
 * @param {string|import("mongoose").Types.ObjectId} requestId - ID yêu cầu cấp phát.
 * @param {Object} payload - Gồm `{ assetId, note }` thiết bị được chọn bàn giao.
 * @param {Object} actor - Kỹ thuật viên hoặc quản trị viên hoàn tất yêu cầu.
 * @returns {Promise<import("mongoose").Document>} Yêu cầu cấp phát ở trạng thái `completed`.
 * @throws {ApiError} Lỗi 404/400/403 nếu không tìm thấy, sai trạng thái hoặc kỹ thuật viên khác đang giữ yêu cầu.
 */
export async function completeAssetRequest(requestId, { assetId, note }, actor) {
  const request = await AssetRequest.findById(requestId);
  if (!request) throw new ApiError(404, "Không tìm thấy yêu cầu cấp phát.");
  if (!["pending", "in_progress"].includes(request.status)) {
    throw new ApiError(400, "Yêu cầu đã hoàn tất hoặc đã bị hủy.");
  }
  // Không cho phép kỹ thuật viên khác xen vào yêu cầu đã có người nhận xử lý
  if (
    actor.role === "technician" &&
    request.technician &&
    !request.technician.equals(actor._id)
  ) {
    throw new ApiError(403, "Yêu cầu này đang do kỹ thuật viên khác xử lý.");
  }

  // Thực hiện cấp phát thiết bị thực tế trước khi đánh dấu yêu cầu hoàn thành
  await assignAsset(
    assetId,
    { userId: request.employee, note: note || `Bàn giao theo yêu cầu ${request.requestCode}.` },
    actor,
  );

  request.asset = assetId;
  request.status = "completed";
  request.completedAt = new Date();
  request.technician = request.technician ?? actor._id;
  request.acceptedAt = request.acceptedAt ?? request.completedAt;
  await request.save();

  return request.populate(requestPopulate);
}

/**
 * Hủy yêu cầu cấp phát đang ở trạng thái `pending` hoặc `in_progress`.
 *
 * @param {string|import("mongoose").Types.ObjectId} requestId - ID yêu cầu cần hủy.
 * @param {Object} payload - Gồm `{ reason }` lý do hủy yêu cầu.
 * @returns {Promise<import("mongoose").Document>} Yêu cầu ở trạng thái `cancelled`.
 * @throws {ApiError} Lỗi 400 nếu yêu cầu không tồn tại hoặc không thể hủy.
 */
export async function cancelAssetRequest(requestId, { reason }) {
  const request = await AssetRequest.findOneAndUpdate(
    { _id: requestId, status: { $in: ["pending", "in_progress"] } },
    { $set: { status: "cancelled", cancelledAt: new Date(), cancelReason: reason || null } },
    { new: true },
  );

  if (!request) throw new ApiError(400, "Yêu cầu không tồn tại hoặc không thể hủy.");
  return request.populate(requestPopulate);
}
