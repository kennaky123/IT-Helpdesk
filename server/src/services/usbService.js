/**
 * @file usbService.js
 * @description Service xử lý nghiệp vụ lõi cho hệ thống giám sát và kiểm soát bảo mật thiết bị USB.
 * Vai trò Service: Tiếp nhận và lưu trữ sự kiện cắm/rút USB từ Windows Agent (`UsbDevice`, `UsbEventLog`),
 * đối chiếu chính sách bảo mật Whitelist (`trusted`) / Blacklist (`blocked`) / Chưa xác minh (`unverified`),
 * đồng bộ danh sách chính sách cho Agent, thu thập thông tin IP mạng LAN máy chủ và tự động ánh xạ
 * tên máy trạm (`hostname`) / tài khoản OS (`osUsername`) sang nhân viên chủ sở hữu thiết bị từ `Asset` & `User`.
 */
import os from "node:os";
import { env } from "../config/env.js";
import Asset from "../models/Asset.js";
import UsbDevice from "../models/UsbDevice.js";
import UsbEventLog from "../models/UsbEventLog.js";
import User from "../models/User.js";
import ApiError from "../utils/ApiError.js";

/**
 * Chuẩn hóa chuỗi khóa tra cứu bằng cách loại bỏ khoảng trắng thừa và chuyển về chữ thường.
 *
 * @param {*} value - Giá trị cần chuẩn hóa.
 * @returns {string} Chuỗi khóa đã chuẩn hóa.
 */
function normalizeKey(value) {
  return String(value || "").trim().toLowerCase();
}

/**
 * Xây dựng bộ giải mã (`resolveHostOwner`) để tự động suy luận nhân viên chủ sở hữu máy trạm
 * dựa trên dữ liệu thiết bị đang cấp phát (`Asset`) và danh sách tài khoản nhân viên (`User`).
 *
 * @returns {Promise<(hostname: string, osUsername: string) => Object|null>} Hàm tra cứu thông tin chủ sở hữu máy.
 */
async function buildHostOwnerResolver() {
  // Truy vấn song song các thiết bị đang sử dụng và tài khoản nhân viên đang hoạt động
  const [activeAssets, activeUsers] = await Promise.all([
    Asset.find({ status: "in_use", assignedTo: { $ne: null } })
      .select("assetTag name serialNumber assignedTo")
      .populate("assignedTo", "fullName email department role")
      .lean(),
    User.find({ status: "active" })
      .select("fullName email department role")
      .lean(),
  ]);

  const byHostnameKey = new Map();
  const byEmailPrefix = new Map();

  // Lập chỉ mục từ mã tài sản (assetTag), số serial và tên thiết bị sang chủ sở hữu
  for (const asset of activeAssets) {
    if (!asset.assignedTo) continue;
    const ownerInfo = {
      _id: asset.assignedTo._id,
      fullName: asset.assignedTo.fullName,
      email: asset.assignedTo.email,
      department: asset.assignedTo.department || null,
      role: asset.assignedTo.role,
      assetTag: asset.assetTag,
      assetName: asset.name,
    };

    for (const candidate of [asset.assetTag, asset.serialNumber, asset.name]) {
      const key = normalizeKey(candidate);
      if (key && !byHostnameKey.has(key)) {
        byHostnameKey.set(key, ownerInfo);
      }
    }
  }

  // Lập chỉ mục dự phòng từ tiền tố email (phần trước '@') sang thông tin nhân viên và máy đang giữ
  for (const u of activeUsers) {
    const emailKey = normalizeKey(u.email?.split("@")[0]);
    if (emailKey && !byEmailPrefix.has(emailKey)) {
      const asset = activeAssets.find(
        (a) => String(a.assignedTo?._id) === String(u._id),
      );
      byEmailPrefix.set(emailKey, {
        _id: u._id,
        fullName: u.fullName,
        email: u.email,
        department: u.department || null,
        role: u.role,
        assetTag: asset?.assetTag || null,
        assetName: asset?.name || null,
      });
    }
  }

  return function resolveHostOwner(hostname, osUsername) {
    // Ưu tiên 1: Đối chiếu hostname của máy trạm với assetTag/serialNumber/tên thiết bị (khớp chính xác hoặc chuỗi con)
    const hostKey = normalizeKey(hostname);
    if (hostKey) {
      if (byHostnameKey.has(hostKey)) return byHostnameKey.get(hostKey);
      for (const [key, owner] of byHostnameKey.entries()) {
        if (hostKey.includes(key) || key.includes(hostKey)) {
          return owner;
        }
      }
    }

    // Ưu tiên 2: Nếu hostname không khớp thiết bị nào, đối chiếu osUsername với tiền tố email nhân viên
    const osKey = normalizeKey(osUsername);
    if (osKey && byEmailPrefix.has(osKey)) {
      return byEmailPrefix.get(osKey);
    }

    return null;
  };
}

/**
 * Thoát các ký tự đặc biệt trong chuỗi trước khi khởi tạo RegExp tìm kiếm.
 *
 * @param {string} str - Chuỗi tìm kiếm thô.
 * @returns {string} Chuỗi đã escape an toàn.
 */
function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Chuẩn hóa địa chỉ IP từ request Express (quy đổi loopback IPv6 `::1` và bỏ tiền tố `::ffff:`).
 *
 * @param {string|undefined} rawIp - Địa chỉ IP thô từ HTTP request.
 * @returns {string} Địa chỉ IPv4 đã làm sạch.
 */
function cleanIp(rawIp) {
  if (!rawIp) return "127.0.0.1";
  const str = String(rawIp).trim();
  if (str === "::1") return "127.0.0.1";
  if (str.startsWith("::ffff:")) return str.slice(7);
  return str;
}

/**
 * Quét các giao diện mạng nội bộ của máy chủ để trả về danh sách địa chỉ IP LAN và URL cấu hình cho USB Agent.
 *
 * @returns {Object} Thông tin `serverHostname`, `port`, `primaryLanIp`, URL máy chủ/web và danh sách `lanAddresses`.
 */
export function getServerNetworkInfo() {
  const interfaces = os.networkInterfaces();
  const lanAddresses = [];

  // Lọc các interface IPv4 vật lý/LAN hợp lệ (loại bỏ loopback nội bộ và địa chỉ APIPA 169.254.x.x)
  for (const [interfaceName, nets] of Object.entries(interfaces)) {
    for (const net of nets || []) {
      if (
        net.family === "IPv4" &&
        !net.internal &&
        !net.address.startsWith("169.254.")
      ) {
        lanAddresses.push({
          interfaceName,
          ip: net.address,
          serverUrl: `http://${net.address}:${env.port}`,
          webUrl: `http://${net.address}:5173`,
          agentDownloadUrl: `http://${net.address}:${env.port}/api/usb/download-agent`,
        });
      }
    }
  }

  const primaryLanIp = lanAddresses[0]?.ip || "127.0.0.1";

  return {
    serverHostname: os.hostname(),
    port: env.port,
    primaryLanIp,
    primaryServerUrl: `http://${primaryLanIp}:${env.port}`,
    primaryWebUrl: `http://${primaryLanIp}:5173`,
    lanAddresses,
  };
}

/**
 * Ghi nhận sự kiện cắm (`connected`) hoặc rút (`disconnected`) thiết bị USB do Agent gửi lên.
 * Tự động tạo mới thiết bị USB ở trạng thái `unverified` nếu lần đầu phát hiện hoặc cập nhật trạng thái
 * kết nối gần nhất, lưu lịch sử `UsbEventLog` và xác định mức độ cảnh báo theo chính sách hiện tại.
 *
 * @param {Object} payload - Dữ liệu sự kiện từ USB Agent (`deviceId`, `deviceName`, `eventType`, `hostname`,...).
 * @param {string} requestIp - Địa chỉ IP của kết nối HTTP gửi yêu cầu.
 * @returns {Promise<{device: Object, eventLog: Object, isNewDevice: boolean, alertLevel: string}>} Kết quả ghi nhận và mức cảnh báo.
 */
export async function recordAgentUsbEvent(payload, requestIp) {
  const now = new Date();
  // Ưu tiên IP LAN do Agent tự khai báo; nếu là loopback thì fallback sang IP trích xuất từ request
  const resolvedIp =
    payload.ipAddress && payload.ipAddress !== "127.0.0.1"
      ? payload.ipAddress
      : cleanIp(requestIp);

  // Chuẩn hóa deviceId về chữ hoa để làm khóa định danh duy nhất
  const normalizedDeviceId = payload.deviceId.trim().toUpperCase();
  let device = await UsbDevice.findOne({ deviceId: normalizedDeviceId });
  let isNewDevice = false;

  if (!device) {
    // Thiết bị USB xuất hiện lần đầu: khởi tạo với trạng thái mặc định "unverified" để chờ duyệt
    isNewDevice = true;
    device = await UsbDevice.create({
      deviceId: normalizedDeviceId,
      deviceName: payload.deviceName,
      vendor: payload.vendor || "Unknown USB Vendor",
      serialNumber: payload.serialNumber || null,
      deviceType: payload.deviceType || "storage",
      driveLetter: payload.driveLetter || null,
      volumeName: payload.volumeName || null,
      status: "unverified",
      isCurrentlyConnected: payload.eventType === "connected",
      lastHost: {
        hostname: payload.hostname,
        osUsername: payload.osUsername || null,
        ipAddress: resolvedIp,
        connectedAt: payload.eventType === "connected" ? now : null,
        disconnectedAt: payload.eventType === "disconnected" ? now : null,
      },
      connectionCount: 1,
    });
  } else {
    // Thiết bị đã biết: cập nhật thông tin phần cứng bổ sung, trạng thái kết nối và host gần nhất
    device.deviceName = payload.deviceName || device.deviceName;
    if (payload.vendor) device.vendor = payload.vendor;
    if (payload.serialNumber) device.serialNumber = payload.serialNumber;
    if (payload.deviceType) device.deviceType = payload.deviceType;
    if (payload.driveLetter !== undefined) device.driveLetter = payload.driveLetter;
    if (payload.volumeName !== undefined) device.volumeName = payload.volumeName;

    device.isCurrentlyConnected = payload.eventType === "connected";
    device.lastHost = {
      hostname: payload.hostname || device.lastHost?.hostname || "UNKNOWN-PC",
      osUsername: payload.osUsername || device.lastHost?.osUsername || null,
      ipAddress: resolvedIp || device.lastHost?.ipAddress || null,
      connectedAt:
        payload.eventType === "connected"
          ? now
          : device.lastHost?.connectedAt || now,
      disconnectedAt:
        payload.eventType === "disconnected"
          ? now
          : device.lastHost?.disconnectedAt || null,
    };

    if (payload.eventType === "connected") {
      device.connectionCount = (device.connectionCount || 0) + 1;
    }

    await device.save();
  }

  // Lưu bản ghi nhật ký sự kiện kèm snapshot trạng thái chính sách của thiết bị tại thời điểm xảy ra
  const eventLog = await UsbEventLog.create({
    usbDevice: device._id,
    deviceId: device.deviceId,
    deviceName: device.deviceName,
    vendor: device.vendor,
    serialNumber: device.serialNumber,
    deviceType: device.deviceType,
    driveLetter: device.driveLetter,
    volumeName: device.volumeName,
    eventType: payload.eventType,
    deviceStatusAtEvent: device.status,
    hostname: payload.hostname,
    osUsername: payload.osUsername || null,
    ipAddress: resolvedIp,
    agentVersion: payload.agentVersion || "1.0.0-win64",
  });

  await device.populate([
    { path: "assignedUser", select: "fullName email department role" },
    { path: "reviewedBy", select: "fullName email role" },
  ]);

  // Đối chiếu trạng thái chính sách thiết bị để xác định mức độ cảnh báo realtime
  let alertLevel = "info";
  if (device.status === "blocked") {
    alertLevel = "critical";
  } else if (device.status === "unverified") {
    alertLevel = "warning";
  }

  return {
    device: device.toObject(),
    eventLog: eventLog.toObject(),
    isNewDevice,
    alertLevel,
  };
}

/**
 * Lấy danh sách chính sách USB rút gọn (`deviceId`, `deviceName`, `status`) để USB Agent đồng bộ.
 *
 * @returns {Promise<Array<{deviceId: string, deviceName: string, status: string}>>} Danh sách chính sách thiết bị.
 */
export async function listAgentUsbPolicies() {
  const devices = await UsbDevice.find({})
    .select("deviceId deviceName status")
    .lean();

  return devices.map((item) => ({
    deviceId: item.deviceId,
    deviceName: item.deviceName,
    status: item.status,
  }));
}

/**
 * Lấy dữ liệu tổng hợp cho Dashboard giám sát USB gồm danh sách thiết bị, 100 nhật ký sự kiện gần nhất,
 * thông tin nhân viên chủ sở hữu máy (`hostOwner`), thống kê số lượng theo chính sách và thông tin mạng LAN.
 *
 * @param {Object} [query={}] - Tham số lọc (`status`, `deviceType`, `connectionState`, `eventType`, `search`).
 * @returns {Promise<{devices: Array, events: Array, summary: Object, networkInfo: Object}>} Dữ liệu dashboard USB.
 */
export async function listUsbDashboardData(query = {}) {
  const deviceFilter = {};
  const eventFilter = {};

  if (query.status) {
    deviceFilter.status = query.status;
    eventFilter.deviceStatusAtEvent = query.status;
  }

  if (query.deviceType) {
    deviceFilter.deviceType = query.deviceType;
    eventFilter.deviceType = query.deviceType;
  }

  if (query.connectionState === "connected") {
    deviceFilter.isCurrentlyConnected = true;
  } else if (query.connectionState === "disconnected") {
    deviceFilter.isCurrentlyConnected = false;
  }

  if (query.eventType) {
    eventFilter.eventType = query.eventType;
  }

  // Áp dụng bộ lọc tìm kiếm theo tên/hãng/ID thiết bị USB, hostname, tài khoản OS hoặc IP
  if (query.search) {
    const regex = new RegExp(escapeRegex(query.search), "i");
    deviceFilter.$or = [
      { deviceName: regex },
      { vendor: regex },
      { deviceId: regex },
      { serialNumber: regex },
      { "lastHost.hostname": regex },
      { "lastHost.osUsername": regex },
      { "lastHost.ipAddress": regex },
    ];
    eventFilter.$or = [
      { deviceName: regex },
      { vendor: regex },
      { deviceId: regex },
      { hostname: regex },
      { osUsername: regex },
      { ipAddress: regex },
    ];
  }

  // Truy vấn song song danh sách thiết bị đã lọc, nhật ký sự kiện, toàn bộ thiết bị cho summary và bộ giải mã chủ sở hữu máy
  const [devices, events, allDevices, totalEvents, resolveHostOwner] = await Promise.all([
    UsbDevice.find(deviceFilter)
      .populate("assignedUser", "fullName email department role")
      .populate("reviewedBy", "fullName email role")
      .sort({ isCurrentlyConnected: -1, updatedAt: -1 })
      .lean(),
    UsbEventLog.find(eventFilter)
      .sort({ createdAt: -1 })
      .limit(100)
      .lean(),
    UsbDevice.find({}).select("status isCurrentlyConnected lastHost").lean(),
    UsbEventLog.countDocuments({}),
    buildHostOwnerResolver(),
  ]);

  // Map nhân viên chủ sở hữu máy (hostOwner) cho từng thiết bị USB (ưu tiên gán thủ công, fallback suy luận theo hostname/osUsername)
  const deviceOwnerByDeviceId = new Map();
  const enrichedDevices = devices.map((device) => {
    const hostOwner =
      device.assignedUser ||
      resolveHostOwner(device.lastHost?.hostname, device.lastHost?.osUsername);
    if (hostOwner) {
      deviceOwnerByDeviceId.set(device.deviceId, hostOwner);
    }
    return {
      ...device,
      hostOwner: hostOwner || null,
    };
  });

  // Gắn thông tin hostOwner tương ứng vào từng dòng nhật ký sự kiện
  const enrichedEvents = events.map((evt) => {
    const hostOwner =
      deviceOwnerByDeviceId.get(evt.deviceId) ||
      resolveHostOwner(evt.hostname, evt.osUsername);
    return {
      ...evt,
      hostOwner: hostOwner || null,
    };
  });

  // Tính toán các chỉ số thống kê tổng quan cho toàn bộ hệ thống USB
  let currentlyConnected = 0;
  let unverifiedCount = 0;
  let trustedCount = 0;
  let blockedCount = 0;
  const activeHosts = new Set();

  for (const item of allDevices) {
    if (item.isCurrentlyConnected) currentlyConnected += 1;
    if (item.status === "unverified") unverifiedCount += 1;
    else if (item.status === "trusted") trustedCount += 1;
    else if (item.status === "blocked") blockedCount += 1;

    if (item.lastHost?.hostname) {
      activeHosts.add(item.lastHost.hostname.toUpperCase());
    }
  }

  return {
    devices: enrichedDevices,
    events: enrichedEvents,
    summary: {
      totalDevices: allDevices.length,
      currentlyConnected,
      unverifiedCount,
      trustedCount,
      blockedCount,
      totalEvents,
      activeHostsCount: activeHosts.size,
    },
    networkInfo: getServerNetworkInfo(),
  };
}

/**
 * Cập nhật chính sách bảo mật (Whitelist `trusted` / Blacklist `blocked` / `unverified`),
 * nhân viên sở hữu hoặc ghi chú cho một thiết bị USB.
 *
 * @param {string|import("mongoose").Types.ObjectId} usbId - ID bản ghi thiết bị USB.
 * @param {Object} payload - Payload cập nhật (`status`, `assignedUser`, `note`).
 * @param {string|import("mongoose").Types.ObjectId} reviewerId - ID quản trị/kỹ thuật viên xét duyệt.
 * @returns {Promise<Object>} Thông tin thiết bị USB sau cập nhật đã populate.
 * @throws {ApiError} Lỗi 404 nếu không tìm thấy thiết bị USB hoặc nhân viên được gán không tồn tại.
 */
export async function updateUsbDevicePolicy(usbId, payload, reviewerId) {
  const device = await UsbDevice.findById(usbId);
  if (!device) {
    throw new ApiError(404, "Không tìm thấy thiết bị USB.");
  }

  if (payload.assignedUser) {
    const userExists = await User.exists({ _id: payload.assignedUser });
    if (!userExists) {
      throw new ApiError(404, "Nhân viên được chọn không tồn tại.");
    }
  }

  if (payload.status !== undefined) {
    device.status = payload.status;
  }
  if (payload.assignedUser !== undefined) {
    device.assignedUser = payload.assignedUser;
  }
  if (payload.note !== undefined) {
    device.note = payload.note;
  }

  device.reviewedBy = reviewerId;
  await device.save();

  await device.populate([
    { path: "assignedUser", select: "fullName email department role" },
    { path: "reviewedBy", select: "fullName email role" },
  ]);

  return device.toObject();
}

/**
 * Xóa bản ghi thiết bị USB khỏi cơ sở dữ liệu và xóa toàn bộ lịch sử sự kiện `UsbEventLog` liên quan.
 *
 * @param {string|import("mongoose").Types.ObjectId} usbId - ID bản ghi thiết bị USB cần xóa.
 * @returns {Promise<Object>} Đối tượng thiết bị USB đã xóa.
 * @throws {ApiError} Lỗi 404 nếu không tìm thấy thiết bị USB.
 */
export async function deleteUsbDevice(usbId) {
  const device = await UsbDevice.findByIdAndDelete(usbId);
  if (!device) {
    throw new ApiError(404, "Không tìm thấy thiết bị USB cần xóa.");
  }

  // Dọn dẹp toàn bộ nhật ký sự kiện gắn với thiết bị vừa xóa
  await UsbEventLog.deleteMany({ usbDevice: device._id });
  return device.toObject();
}
