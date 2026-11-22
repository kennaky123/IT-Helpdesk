import Asset from "../models/Asset.js";
import SoftwareLicense from "../models/SoftwareLicense.js";
import User from "../models/User.js";
import ApiError from "../utils/ApiError.js";

const personSelect = "fullName email department phone role status avatar";

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

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

function enrichLicense(doc, now = new Date(), activeMachineMap = null) {
  const license = doc.toObject ? doc.toObject() : { ...doc };
  let assignedUsers = Array.isArray(license.assignedUsers)
    ? license.assignedUsers
    : [];

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

  const assignedCount = assignedUsers.length;
  const availableSeats = Math.max(0, license.totalSeats - assignedCount);
  const utilizationRate = license.totalSeats > 0
    ? Math.round((assignedCount / license.totalSeats) * 100)
    : 0;

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

export async function listSoftwareLicenses(query = {}, user) {
  const filter = {};
  const now = new Date();

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

  const [licenses, activeMachineMap] = await Promise.all([
    SoftwareLicense.find(filter)
      .populate({ path: "assignedUsers.user", select: personSelect })
      .populate({ path: "createdBy", select: "fullName role" })
      .sort({ updatedAt: -1, _id: -1 })
      .lean(),
    getActiveMachineByUserMap(),
  ]);

  let enriched = licenses.map((lic) => enrichLicense(lic, now, activeMachineMap));

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

  if (query.status) {
    enriched = enriched.filter((lic) => lic.status === query.status);
  }

  const finOps = user?.role === "user" ? null : await getFinOpsSummary();

  return {
    licenses: enriched,
    finOps,
  };
}

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

export async function createSoftwareLicense(input, actor) {
  const license = await SoftwareLicense.create({
    ...input,
    createdBy: actor._id,
    updatedBy: actor._id,
  });

  return enrichLicense(license);
}

export async function updateSoftwareLicense(licenseId, input, actor) {
  const license = await SoftwareLicense.findById(licenseId);
  if (!license) throw new ApiError(404, "Không tìm thấy bản quyền phần mềm.");

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

export async function allocateLicense(licenseId, { userId, note }, actor) {
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

  license.assignedUsers = (license.assignedUsers || []).filter((item) =>
    activeMachineMap.has(String(item.user?._id ?? item.user ?? "")),
  );

  const employeeIdStr = String(employee._id);
  const isAlreadyAssigned = license.assignedUsers.some(
    (item) => String(item.user?._id ?? item.user ?? "") === employeeIdStr,
  );
  if (isAlreadyAssigned) {
    throw new ApiError(400, `${employee.fullName} đã được cấp bản quyền này rồi.`);
  }

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

