/**
 * @file softwareService.js
 * @description Service xử lý nghiệp vụ lõi quản lý bản quyền phần mềm (`SoftwareLicense`) và tính toán chi phí FinOps CNTT.
 * Vai trò Service: Thực hiện truy vấn và làm giàu dữ liệu bản quyền (đối chiếu nhân viên còn giữ thiết bị công ty,
 * tính số seat trống, tỷ lệ sử dụng, trạng thái hết hạn), cấp phát/thu hồi license và tổng hợp báo cáo FinOps
 * (chi phí theo tháng/năm, chi phí lãng phí từ ghế chưa sử dụng).
 */
import Asset from "../models/Asset.js";
import SoftwareLicense from "../models/SoftwareLicense.js";
import User from "../models/User.js";
import ApiError from "../utils/ApiError.js";

const personSelect = "fullName email department phone role status avatar";

/**
 * Thoát các ký tự đặc biệt trong chuỗi để sử dụng an toàn trong truy vấn `$regex`.
 *
 * @param {string} value - Chuỗi từ khóa tìm kiếm thô.
 * @returns {string} Chuỗi đã được escape.
 */
function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Lập bản đồ ánh xạ mỗi `userId` tới danh sách thiết bị đang ở trạng thái sử dụng (`in_use`).
 * Dùng để xác thực nhân viên được cấp bản quyền phần mềm thực sự đang giữ máy tính của công ty.
 *
 * @returns {Promise<Map<string, Array<{assetTag: string, name: string, type: string}>>>} Map ánh xạ userId -> danh sách thiết bị.
 */
async function getActiveMachineByUserMap() {
  const assets = await Asset.find({ status: "in_use" })
    .select("assignedTo assetTag name type")
    .lean();

  const map = new Map();
  for (const asset of assets) {
    if (!asset.assignedTo) continue;
    const userId = String(asset.assignedTo);
    const list = map.get(userId) ?? [];
    list.push({
      assetTag: asset.assetTag,
      name: asset.name,
      type: asset.type,
    });
    map.set(userId, list);
  }
  return map;
}

/**
 * Làm giàu dữ liệu gói bản quyền phần mềm với số lượng seat thực dùng, tình trạng hết hạn và chi phí hàng tháng.
 *
 * @param {Object} doc - Document `SoftwareLicense` (Mongoose document hoặc object lean).
 * @param {Date} [now=new Date()] - Thời điểm hiện tại dùng để đối chiếu ngày hết hạn.
 * @param {Map|null} [activeMachineMap=null] - Bản đồ thiết bị đang hoạt động theo user để lọc và đính kèm thiết bị.
 * @returns {Object} Đối tượng bản quyền đã bổ sung `assignedCount`, `availableSeats`, `utilizationRate`, `status`, `monthlyCost`.
 */
function enrichLicense(doc, now = new Date(), activeMachineMap = null) {
  const license = doc.toObject ? doc.toObject() : { ...doc };
  let assignedUsers = Array.isArray(license.assignedUsers)
    ? license.assignedUsers
    : [];

  // Nếu có activeMachineMap, chỉ giữ lại các lượt cấp phát thuộc nhân viên đang giữ thiết bị công ty và gắn kèm danh sách máy
  if (activeMachineMap) {
    assignedUsers = assignedUsers
      .map((entry) => {
        const userId = String(entry.user?._id ?? entry.user ?? "");
        const devices = activeMachineMap.get(userId);
        if (!devices || devices.length === 0) return null;
        return { ...entry, devices };
      })
      .filter(Boolean);
  }

  // Tính toán số ghế đã dùng, số ghế trống và tỷ lệ tận dụng (%)
  const assignedCount = assignedUsers.length;
  const availableSeats = Math.max(0, license.totalSeats - assignedCount);
  const utilizationRate = license.totalSeats > 0
    ? Math.round((assignedCount / license.totalSeats) * 100)
    : 0;

  // Đánh giá trạng thái hiệu lực dựa trên khoảng cách ngày đến expiryDate (ngưỡng cảnh báo 30 ngày)
  let status = "active";
  if (license.expiryDate) {
    const expTime = new Date(license.expiryDate).getTime();
    const diffDays = Math.ceil((expTime - now.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) {
      status = "expired";
    } else if (diffDays <= 30) {
      status = "expiring_soon";
    }
  }

  // Quy đổi chi phí bản quyền theo tháng phục vụ tính toán FinOps
  // Monthly cost estimation
  let monthlyCost = 0;
  const cost = Number(license.costPerSeat || 0) * Number(license.totalSeats || 0);
  if (license.billingCycle === "monthly") {
    monthlyCost = cost;
  } else if (license.billingCycle === "yearly") {
    monthlyCost = Math.round(cost / 12);
  }

  return {
    ...license,
    assignedUsers,
    assignedCount,
    availableSeats,
    utilizationRate,
    status,
    monthlyCost,
  };
}

/**
 * Lấy danh sách bản quyền phần mềm theo bộ lọc và vai trò người dùng, kèm tổng hợp chi phí FinOps.
 *
 * @param {Object} [query={}] - Tham số lọc (`category`, `type`, `search`, `status`).
 * @param {Object} user - Người dùng hiện tại (nếu là `user` chỉ thấy license được cấp cho bản thân).
 * @returns {Promise<{licenses: Array, finOps: Object|null}>} Danh sách bản quyền đã làm giàu và báo cáo FinOps (ẩn với `user`).
 */
export async function listSoftwareLicenses(query = {}, user) {
  const filter = {};
  const now = new Date();

  // Người dùng thường chỉ truy vấn các gói phần mềm có gán ID của họ
  if (user?.role === "user") {
    filter["assignedUsers.user"] = user._id;
  }

  if (query.category) filter.category = query.category;
  if (query.type) filter.type = query.type;

  if (query.search) {
    const pattern = { $regex: escapeRegex(query.search), $options: "i" };
    filter.$or = [
      { name: pattern },
      { vendor: pattern },
      { licenseKey: pattern },
    ];
  }

  // Truy vấn song song danh sách bản quyền và bản đồ thiết bị đang hoạt động
  const [licenses, activeMachineMap] = await Promise.all([
    SoftwareLicense.find(filter)
      .populate({ path: "assignedUsers.user", select: personSelect })
      .populate({ path: "createdBy", select: "fullName role" })
      .sort({ updatedAt: -1, _id: -1 })
      .lean(),
    getActiveMachineByUserMap(),
  ]);

  let enriched = licenses.map((lic) => enrichLicense(lic, now, activeMachineMap));

  // Với vai trò user, ẩn thông tin cấp phát của các nhân viên khác trong cùng gói bản quyền
  if (user?.role === "user") {
    const userIdStr = String(user._id);
    enriched = enriched
      .map((lic) => {
        const myAssignments = (lic.assignedUsers || []).filter(
          (entry) => String(entry.user?._id ?? entry.user ?? "") === userIdStr,
        );
        if (myAssignments.length === 0) return null;
        return {
          ...lic,
          assignedUsers: myAssignments,
        };
      })
      .filter(Boolean);
  }

  // Lọc theo trạng thái tính toán động (active / expiring_soon / expired)
  if (query.status) {
    enriched = enriched.filter((lic) => lic.status === query.status);
  }

  // Chỉ Admin/Technician mới nhận dữ liệu tổng hợp tài chính FinOps
  const finOps = user?.role === "user" ? null : await getFinOpsSummary();

  return {
    licenses: enriched,
    finOps,
  };
}

/**
 * Lấy thông tin chi tiết một gói bản quyền phần mềm kèm tính toán trạng thái và thiết bị gắn kèm.
 *
 * @param {string|import("mongoose").Types.ObjectId} licenseId - ID gói bản quyền.
 * @returns {Promise<Object>} Đối tượng bản quyền đã làm giàu.
 * @throws {ApiError} Lỗi 404 nếu không tìm thấy bản quyền.
 */
export async function getSoftwareLicense(licenseId) {
  const [license, activeMachineMap] = await Promise.all([
    SoftwareLicense.findById(licenseId)
      .populate({ path: "assignedUsers.user", select: personSelect })
      .populate({ path: "createdBy", select: "fullName role" }),
    getActiveMachineByUserMap(),
  ]);

  if (!license) throw new ApiError(404, "Không tìm thấy thông tin bản quyền phần mềm.");
  return enrichLicense(license, new Date(), activeMachineMap);
}

/**
 * Tạo mới một gói bản quyền phần mềm.
 *
 * @param {Object} input - Thông tin bản quyền (`name`, `vendor`, `totalSeats`, `costPerSeat`, `billingCycle`,...).
 * @param {Object} actor - Người thực hiện tạo mới.
 * @returns {Promise<Object>} Bản quyền vừa tạo đã tính toán chỉ số sử dụng và chi phí tháng.
 */
export async function createSoftwareLicense(input, actor) {
  const license = await SoftwareLicense.create({
    ...input,
    createdBy: actor._id,
    updatedBy: actor._id,
  });

  return enrichLicense(license);
}

/**
 * Cập nhật thông tin gói bản quyền phần mềm, ngăn giảm tổng số ghế xuống thấp hơn số đang cấp phát.
 *
 * @param {string|import("mongoose").Types.ObjectId} licenseId - ID gói bản quyền.
 * @param {Object} input - Dữ liệu cập nhật.
 * @param {Object} actor - Người thực hiện cập nhật.
 * @returns {Promise<Object>} Bản quyền sau cập nhật đã làm giàu.
 * @throws {ApiError} Lỗi 404 nếu không tồn tại hoặc 400 nếu `totalSeats` nhỏ hơn số lượng đang gán.
 */
export async function updateSoftwareLicense(licenseId, input, actor) {
  const license = await SoftwareLicense.findById(licenseId);
  if (!license) throw new ApiError(404, "Không tìm thấy bản quyền phần mềm.");

  // Bảo toàn số lượng seat đang cấp phát: không cho hạ totalSeats thấp hơn số nhân viên hiện có
  if (input.totalSeats !== undefined && input.totalSeats < license.assignedUsers.length) {
    throw new ApiError(
      400,
      `Không thể giảm tổng số bản quyền xuống ${input.totalSeats} vì hiện đang cấp phát cho ${license.assignedUsers.length} nhân viên. Hãy thu hồi bớt trước.`,
    );
  }

  Object.assign(license, input, { updatedBy: actor._id });
  await license.save();

  const [populated, activeMachineMap] = await Promise.all([
    SoftwareLicense.findById(licenseId).populate({
      path: "assignedUsers.user",
      select: personSelect,
    }),
    getActiveMachineByUserMap(),
  ]);

  return enrichLicense(populated, new Date(), activeMachineMap);
}

/**
 * Xóa gói bản quyền phần mềm khỏi hệ thống (yêu cầu đã thu hồi hết từ nhân viên).
 *
 * @param {string|import("mongoose").Types.ObjectId} licenseId - ID gói bản quyền cần xóa.
 * @returns {Promise<void>}
 * @throws {ApiError} Lỗi 404 nếu không tìm thấy hoặc 400 nếu còn nhân viên đang sử dụng license.
 */
export async function deleteSoftwareLicense(licenseId) {
  const license = await SoftwareLicense.findById(licenseId);
  if (!license) throw new ApiError(404, "Không tìm thấy bản quyền phần mềm.");

  if (license.assignedUsers.length > 0) {
    throw new ApiError(
      400,
      `Không thể xóa vì bản quyền này đang được cấp phát cho ${license.assignedUsers.length} nhân viên. Hãy thu hồi hết trước khi xóa.`,
    );
  }

  await license.deleteOne();
}

/**
 * Cấp phát 1 suất bản quyền phần mềm cho nhân viên đang sử dụng thiết bị công ty.
 * Tự động dọn dẹp các lượt gán cũ của những nhân viên không còn giữ thiết bị trước khi kiểm tra chỗ trống.
 *
 * @param {string|import("mongoose").Types.ObjectId} licenseId - ID gói bản quyền.
 * @param {Object} payload - Gồm `{ userId, note }`.
 * @param {Object} actor - Người thực hiện cấp phát.
 * @returns {Promise<Object>} Bản quyền sau cấp phát đã làm giàu.
 * @throws {ApiError} Lỗi 404/400/409 nếu không thấy license, nhân viên không có máy hoặc đã hết seat.
 */
export async function allocateLicense(licenseId, { userId, note }, actor) {
  // Kiểm tra đồng thời bản quyền, tài khoản nhân viên, thiết bị đang dùng và bản đồ máy
  const [license, employee, hasActiveMachine, activeMachineMap] = await Promise.all([
    SoftwareLicense.findById(licenseId),
    User.findOne({ _id: userId, status: "active" }),
    Asset.exists({ assignedTo: userId, status: "in_use" }),
    getActiveMachineByUserMap(),
  ]);

  if (!license) throw new ApiError(404, "Không tìm thấy bản quyền phần mềm.");
  if (!employee) throw new ApiError(400, "Nhân viên không tồn tại hoặc đã bị khóa.");
  if (!hasActiveMachine) {
    throw new ApiError(400, "Nhân viên này hiện không sử dụng thiết bị nào của công ty.");
  }

  // Làm sạch các lượt gán mồ côi của nhân viên không còn giữ thiết bị in_use nào
  license.assignedUsers = (license.assignedUsers || []).filter((item) =>
    activeMachineMap.has(String(item.user?._id ?? item.user ?? "")),
  );

  // Chặn cấp phát trùng lặp cho cùng một nhân viên
  const employeeIdStr = String(employee._id);
  const isAlreadyAssigned = license.assignedUsers.some(
    (item) => String(item.user?._id ?? item.user ?? "") === employeeIdStr,
  );
  if (isAlreadyAssigned) {
    throw new ApiError(400, `${employee.fullName} đã được cấp bản quyền này rồi.`);
  }

  // Kiểm tra giới hạn tổng số seat của gói bản quyền
  if (license.assignedUsers.length >= license.totalSeats) {
    throw new ApiError(
      409,
      `Đã hết số lượng bản quyền trống (${license.assignedUsers.length}/${license.totalSeats} seats). Vui lòng mua thêm hoặc thu hồi từ nhân sự khác.`,
    );
  }

  license.assignedUsers.push({
    user: employee._id,
    assignedAt: new Date(),
    note: note || `Cấp phát bởi ${actor.fullName || "Admin"}.`,
  });
  license.updatedBy = actor._id;
  await license.save();

  return enrichLicense(
    await SoftwareLicense.findById(licenseId).populate({
      path: "assignedUsers.user",
      select: personSelect,
    }),
    new Date(),
    activeMachineMap,
  );
}

/**
 * Thu hồi suất bản quyền phần mềm của một nhân viên.
 *
 * @param {string|import("mongoose").Types.ObjectId} licenseId - ID gói bản quyền.
 * @param {Object} payload - Gồm `{ userId }` nhân viên bị thu hồi.
 * @param {Object} actor - Người thực hiện thu hồi.
 * @returns {Promise<Object>} Bản quyền sau khi thu hồi đã làm giàu.
 * @throws {ApiError} Lỗi 404 nếu không thấy license hoặc 400 nếu nhân viên không sở hữu bản quyền này.
 */
export async function revokeLicense(licenseId, { userId }, actor) {
  const license = await SoftwareLicense.findById(licenseId);
  if (!license) throw new ApiError(404, "Không tìm thấy bản quyền phần mềm.");

  const userIdStr = String(userId);
  const initialCount = license.assignedUsers.length;
  license.assignedUsers = license.assignedUsers.filter(
    (item) => String(item.user?._id ?? item.user ?? "") !== userIdStr,
  );

  if (license.assignedUsers.length === initialCount) {
    throw new ApiError(400, "Nhân viên này hiện không sở hữu bản quyền đã chọn.");
  }

  license.updatedBy = actor._id;
  await license.save();

  const [populated, activeMachineMap] = await Promise.all([
    SoftwareLicense.findById(licenseId).populate({
      path: "assignedUsers.user",
      select: personSelect,
    }),
    getActiveMachineByUserMap(),
  ]);

  return enrichLicense(populated, new Date(), activeMachineMap);
}

/**
 * Tính toán báo cáo FinOps tổng hợp cho toàn bộ danh mục bản quyền phần mềm:
 * tổng số ghế, số ghế đã cấp phát thực tế (theo máy đang sử dụng), chi phí hàng tháng/hàng năm,
 * chi phí lãng phí từ ghế chưa sử dụng (`wastedMonthlyCost`) và số gói sắp/đã hết hạn.
 *
 * @returns {Promise<Object>} Đối tượng số liệu FinOps tổng quan.
 */
export async function getFinOpsSummary() {
  const [licenses, activeMachineMap] = await Promise.all([
    SoftwareLicense.find().lean(),
    getActiveMachineByUserMap(),
  ]);
  const now = new Date();

  let totalLicenses = licenses.length;
  let totalSeats = 0;
  let assignedSeats = 0;
  let monthlyTotalCost = 0;
  let yearlyTotalCost = 0;
  let wastedMonthlyCost = 0;
  let expiringSoonCount = 0;
  let expiredCount = 0;

  for (const lic of licenses) {
    const seats = Number(lic.totalSeats || 0);
    // Chỉ tính là đã sử dụng nếu nhân viên được gán hiện vẫn còn giữ thiết bị công ty
    const assigned = Array.isArray(lic.assignedUsers)
      ? lic.assignedUsers.filter((entry) =>
          activeMachineMap.has(String(entry.user?._id ?? entry.user ?? "")),
        ).length
      : 0;
    const unassigned = Math.max(0, seats - assigned);
    const costPerSeat = Number(lic.costPerSeat || 0);
    const totalLicCost = costPerSeat * seats;

    totalSeats += seats;
    assignedSeats += assigned;

    // Quy đổi chi phí tổng và chi phí lãng phí (ghế trống) về đơn vị tháng và năm theo chu kỳ thanh toán
    let monthly = 0;
    let yearly = 0;
    if (lic.billingCycle === "monthly") {
      monthly = totalLicCost;
      yearly = totalLicCost * 12;
      wastedMonthlyCost += costPerSeat * unassigned;
    } else if (lic.billingCycle === "yearly") {
      monthly = Math.round(totalLicCost / 12);
      yearly = totalLicCost;
      wastedMonthlyCost += Math.round((costPerSeat * unassigned) / 12);
    }

    monthlyTotalCost += monthly;
    yearlyTotalCost += yearly;

    // Phân loại các gói bản quyền đã hết hạn hoặc sắp hết hạn trong vòng 30 ngày
    if (lic.expiryDate) {
      const expTime = new Date(lic.expiryDate).getTime();
      const diffDays = Math.ceil((expTime - now.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays < 0) {
        expiredCount += 1;
      } else if (diffDays <= 30) {
        expiringSoonCount += 1;
      }
    }
  }

  const utilizationRate = totalSeats > 0 ? Math.round((assignedSeats / totalSeats) * 100) : 0;

  return {
    totalLicenses,
    totalSeats,
    assignedSeats,
    unassignedSeats: Math.max(0, totalSeats - assignedSeats),
    utilizationRate,
    monthlyTotalCost,
    yearlyTotalCost,
    wastedMonthlyCost,
    expiringSoonCount,
    expiredCount,
  };
}
