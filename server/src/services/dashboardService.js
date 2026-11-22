/**
 * @file dashboardService.js
 * @description Service xử lý nghiệp vụ lõi cho tổng hợp số liệu, biểu đồ và chỉ số hiệu suất Dashboard.
 * Vai trò Service: Thực thi các MongoDB Aggregation Pipeline đa chiều (`$facet`, `$group`, `$dateToString`),
 * tính thời gian giải quyết trung bình (chỉ số SLA từ `createdAt` đến `resolvedAt`), chuẩn hóa
 * chuỗi ngày theo múi giờ Việt Nam (`Asia/Ho_Chi_Minh`) và trả dữ liệu cho Admin, Kỹ thuật viên và User.
 */
import {
  TICKET_PRIORITIES,
  TICKET_STATUSES,
} from "../constants/ticket.js";
import Category from "../models/Category.js";
import Rating from "../models/Rating.js";
import Ticket from "../models/Ticket.js";
import User from "../models/User.js";

export const DASHBOARD_TIME_ZONE = "Asia/Ho_Chi_Minh";
export const PROCESSING_STATUSES = Object.freeze([
  "assigned",
  "in_progress",
  "waiting_user",
]);
export const COMPLETED_STATUSES = Object.freeze(["resolved", "closed"]);

const STATUS_DEFINITIONS = Object.freeze([
  { key: "pending", name: "Đang chờ" },
  { key: "assigned", name: "Đã phân công" },
  { key: "in_progress", name: "Đang xử lý" },
  { key: "waiting_user", name: "Chờ người dùng" },
  { key: "resolved", name: "Đã giải quyết" },
  { key: "closed", name: "Đã đóng" },
  { key: "cancelled", name: "Đã hủy" },
]);

const PRIORITY_LABELS = Object.freeze({
  low: "Thấp",
  medium: "Trung bình",
  high: "Cao",
  urgent: "Khẩn cấp",
});

/**
 * Làm tròn số thực tới tối đa 2 chữ số thập phân, xử lý sai số dấu phẩy động bằng `Number.EPSILON`.
 *
 * @param {number} value - Giá trị số cần làm tròn.
 * @returns {number} Giá trị sau khi làm tròn 2 chữ số thập phân.
 */
function roundToTwoDecimals(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Chuyển đổi đối tượng Date (hoặc chuỗi ngày) thành khóa ngày `YYYY-MM-DD` theo múi giờ chỉ định.
 *
 * @param {Date|string|number} date - Thời điểm cần quy đổi.
 * @param {string} [timeZone=DASHBOARD_TIME_ZONE] - Tên múi giờ IANA (mặc định `Asia/Ho_Chi_Minh`).
 * @returns {string} Chuỗi ngày định dạng `YYYY-MM-DD`.
 * @throws {TypeError} Nếu giá trị `date` không hợp lệ.
 */
export function getDateKeyInTimeZone(
  date,
  timeZone = DASHBOARD_TIME_ZONE,
) {
  const normalizedDate = date instanceof Date ? date : new Date(date);

  if (Number.isNaN(normalizedDate.getTime())) {
    throw new TypeError("Ngày tham chiếu dashboard không hợp lệ.");
  }

  // Dùng Intl.DateTimeFormat.formatToParts để tách chính xác năm/tháng/ngày theo múi giờ địa phương
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(normalizedDate);
  const partValues = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  return `${partValues.year}-${partValues.month}-${partValues.day}`;
}

/**
 * Dịch chuyển một khóa ngày dương lịch `YYYY-MM-DD` thêm hoặc bớt một số ngày nguyên.
 *
 * @param {string} dateKey - Khóa ngày gốc định dạng `YYYY-MM-DD`.
 * @param {number} amount - Số ngày cần cộng (dương) hoặc trừ (âm).
 * @returns {string} Khóa ngày mới định dạng `YYYY-MM-DD`.
 * @throws {TypeError} Nếu định dạng ngày hoặc số ngày dịch chuyển không hợp lệ.
 */
export function shiftCalendarDateKey(dateKey, amount) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);

  if (!match || !Number.isInteger(amount)) {
    throw new TypeError("Ngày hoặc số ngày dịch chuyển không hợp lệ.");
  }

  // Tính toán trên UTC để tránh sai lệch chuyển đổi giờ mùa hè (DST)
  const shiftedDate = new Date(
    Date.UTC(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]) + amount,
    ),
  );

  return shiftedDate.toISOString().slice(0, 10);
}

/**
 * Điền đầy đủ chuỗi dữ liệu biểu đồ cho N ngày gần nhất (kể cả những ngày có giá trị 0).
 *
 * @param {Array} rows - Các dòng kết quả aggregation nhóm theo ngày (`_id` hoặc `date`).
 * @param {Object} [options] - Tùy chọn cấu hình khoảng ngày và múi giờ.
 * @param {Date} [options.now=new Date()] - Ngày tham chiếu cuối cùng của chuỗi.
 * @param {number} [options.days=7] - Số ngày cần tạo chuỗi (1..366).
 * @param {string} [options.timeZone=DASHBOARD_TIME_ZONE] - Múi giờ quy đổi ngày.
 * @returns {Array<{date: string, name: string, value: number}>} Mảng điểm dữ liệu liên tục theo ngày (`DD/MM`).
 */
export function buildLastNDaysSeries(
  rows,
  {
    now = new Date(),
    days = 7,
    timeZone = DASHBOARD_TIME_ZONE,
  } = {},
) {
  if (!Number.isInteger(days) || days < 1 || days > 366) {
    throw new RangeError("Số ngày thống kê phải từ 1 đến 366.");
  }

  // Tạo danh sách đầy đủ N khóa ngày liên tiếp kết thúc ở hôm nay
  const todayKey = getDateKeyInTimeZone(now, timeZone);
  const dateKeys = Array.from({ length: days }, (_item, index) =>
    shiftCalendarDateKey(todayKey, index - days + 1),
  );
  const allowedDateKeys = new Set(dateKeys);
  const countByDate = new Map();

  // Cộng dồn các bản ghi thống kê vào Map theo ngày nằm trong cửa sổ cho phép
  for (const row of rows ?? []) {
    const dateKey = row._id ?? row.date;
    const rawValue = row.value ?? row.count ?? 0;
    const value = Number(rawValue);

    if (
      allowedDateKeys.has(dateKey) &&
      Number.isFinite(value) &&
      value >= 0
    ) {
      countByDate.set(dateKey, (countByDate.get(dateKey) ?? 0) + value);
    }
  }

  // Ánh xạ sang cấu trúc nhãn hiển thị biểu đồ (DD/MM) với mặc định 0 nếu không có dữ liệu
  return dateKeys.map((dateKey) => {
    const dateParts = dateKey.split("-");
    const month = dateParts[1];
    const day = dateParts[2];

    return {
      date: dateKey,
      name: `${day}/${month}`,
      value: countByDate.get(dateKey) ?? 0,
    };
  });
}

/**
 * Chuẩn hóa chuỗi thống kê theo danh sách enum cố định, đảm bảo mọi trạng thái đều có mặt (mặc định 0).
 *
 * @param {Array} rows - Kết quả aggregation đếm theo khóa enum.
 * @param {Array<{key: string, name: string}>} definitions - Danh sách định nghĩa enum và nhãn tiếng Việt.
 * @returns {Array<{key: string, name: string, value: number}>} Chuỗi dữ liệu đầy đủ mọi khóa định nghĩa.
 */
export function fillEnumSeries(rows, definitions) {
  const countByKey = new Map();

  for (const row of rows ?? []) {
    const key = row._id ?? row.key;
    const value = Number(row.value ?? row.count ?? 0);

    if (typeof key === "string" && Number.isFinite(value) && value >= 0) {
      countByKey.set(key, (countByKey.get(key) ?? 0) + value);
    }
  }

  return definitions.map(({ key, name }) => ({
    key,
    name,
    value: countByKey.get(key) ?? 0,
  }));
}

/**
 * Quy đổi thời gian xử lý trung bình (SLA) từ mili-giây sang phút và giờ kèm cỡ mẫu.
 *
 * @param {number|null|undefined} averageMilliseconds - Thời gian xử lý trung bình (ms).
 * @param {number} sampleSize - Số lượng ticket hợp lệ tham gia tính trung bình.
 * @returns {{sampleSize: number, milliseconds: number|null, minutes: number|null, hours: number|null}} Thời gian xử lý chuẩn hóa.
 */
export function formatAverageResolutionTime(
  averageMilliseconds,
  sampleSize,
) {
  const normalizedAverage = Number(averageMilliseconds);
  const normalizedSampleSize = Number(sampleSize);

  // Nếu không có mẫu hợp lệ hoặc giá trị âm/NaN, trả về giá trị null cho các đơn vị thời gian
  if (
    !Number.isFinite(normalizedAverage) ||
    normalizedAverage < 0 ||
    !Number.isInteger(normalizedSampleSize) ||
    normalizedSampleSize < 1
  ) {
    return {
      sampleSize: 0,
      milliseconds: null,
      minutes: null,
      hours: null,
    };
  }

  return {
    sampleSize: normalizedSampleSize,
    milliseconds: Math.round(normalizedAverage),
    minutes: roundToTwoDecimals(normalizedAverage / 60_000),
    hours: roundToTwoDecimals(normalizedAverage / 3_600_000),
  };
}

/**
 * Gộp và chuẩn hóa các chỉ số tổng quan dashboard (tổng ticket, đang xử lý, hoàn thành, SLA trung bình, đánh giá sao).
 *
 * @param {Object} rawSummary - Số liệu đếm thô từ pipeline `$facet.summary`.
 * @param {Object} resolutionStats - Thống kê thời gian xử lý trung bình từ `getResolutionStatistics`.
 * @param {Object} [ratingStats={}] - Thống kê số lượt và điểm đánh giá trung bình.
 * @returns {Object} Đối tượng summary chuẩn hóa cho Admin dashboard.
 */
export function normalizeDashboardSummary(
  rawSummary,
  resolutionStats,
  ratingStats = {},
) {
  const ratingCount = Number(ratingStats?.ratingCount ?? 0);
  const averageScore = Number(ratingStats?.averageScore);
  return {
    totalTickets: Number(rawSummary?.totalTickets ?? 0),
    pendingTickets: Number(rawSummary?.pendingTickets ?? 0),
    processingTickets: Number(rawSummary?.processingTickets ?? 0),
    completedTickets: Number(rawSummary?.completedTickets ?? 0),
    urgentTickets: Number(rawSummary?.urgentTickets ?? 0),
    averageResolutionTime: formatAverageResolutionTime(
      resolutionStats?.averageMilliseconds,
      Number(resolutionStats?.sampleSize ?? 0),
    ),
    ratingCount,
    averageRating:
      ratingCount > 0 && Number.isFinite(averageScore)
        ? Math.round(averageScore * 10) / 10
        : null,
  };
}

/**
 * Xác định khoảng thời gian 7 ngày gần nhất theo múi giờ Việt Nam (`+07:00`) tính đến ngày tham chiếu.
 *
 * @param {Date} referenceDate - Ngày tham chiếu hiện tại.
 * @returns {{startDate: Date, endExclusiveDate: Date, from: string, to: string}} Khoảng thời gian truy vấn MongoDB.
 */
function getVietnamDateRange(referenceDate) {
  const todayKey = getDateKeyInTimeZone(
    referenceDate,
    DASHBOARD_TIME_ZONE,
  );
  const startKey = shiftCalendarDateKey(todayKey, -6);
  const endExclusiveKey = shiftCalendarDateKey(todayKey, 1);

  return {
    startDate: new Date(`${startKey}T00:00:00+07:00`),
    endExclusiveDate: new Date(`${endExclusiveKey}T00:00:00+07:00`),
    from: startKey,
    to: todayKey,
  };
}

/**
 * Chuyển đổi cặp khóa ngày bắt đầu và kết thúc (exclusive) thành đối tượng Date với múi giờ `+07:00`.
 *
 * @param {string} startKey - Ngày bắt đầu (`YYYY-MM-DD`).
 * @param {string} endExclusiveKey - Ngày kết thúc mở (`YYYY-MM-DD`).
 * @returns {{startDate: Date, endExclusiveDate: Date}} Cặp mốc Date dùng cho truy vấn `$gte` / `$lt`.
 */
function getDateRangeFromKeys(startKey, endExclusiveKey) {
  return {
    startDate: new Date(`${startKey}T00:00:00+07:00`),
    endExclusiveDate: new Date(`${endExclusiveKey}T00:00:00+07:00`),
  };
}

/**
 * Tính các khung thời gian Hôm nay, Tuần này (từ Thứ 2) và Tháng này theo múi giờ Việt Nam cho Dashboard Kỹ thuật viên.
 *
 * @param {Date} referenceDate - Ngày tham chiếu.
 * @returns {{today: Object, week: Object, month: Object}} Các khoảng thời gian lọc KPI của kỹ thuật viên.
 */
function getTechnicianDashboardRanges(referenceDate) {
  const todayKey = getDateKeyInTimeZone(referenceDate, DASHBOARD_TIME_ZONE);
  const utcDay = new Date(`${todayKey}T00:00:00Z`).getUTCDay();
  // Quy đổi thứ trong tuần (Chủ nhật = 0 -> lùi 6 ngày về Thứ 2)
  const daysSinceMonday = utcDay === 0 ? 6 : utcDay - 1;
  const weekStartKey = shiftCalendarDateKey(todayKey, -daysSinceMonday);
  const monthStartKey = `${todayKey.slice(0, 7)}-01`;
  const monthStartDate = new Date(`${monthStartKey}T00:00:00Z`);
  const nextMonthStartKey = new Date(
    Date.UTC(
      monthStartDate.getUTCFullYear(),
      monthStartDate.getUTCMonth() + 1,
      1,
    ),
  )
    .toISOString()
    .slice(0, 10);

  return {
    today: getDateRangeFromKeys(todayKey, shiftCalendarDateKey(todayKey, 1)),
    week: getDateRangeFromKeys(weekStartKey, shiftCalendarDateKey(todayKey, 1)),
    month: getDateRangeFromKeys(monthStartKey, nextMonthStartKey),
  };
}

/**
 * Chạy aggregation `$facet` đơn trên collection `Ticket` để lấy đồng thời thống kê tổng, theo trạng thái và theo danh mục.
 *
 * @returns {Promise<Array>} Kết quả aggregation gồm `summary`, `byStatus`, `byCategory`.
 */
function getTicketSnapshot() {
  return Ticket.aggregate([
    {
      $facet: {
        summary: [
          {
            $group: {
              _id: null,
              totalTickets: { $sum: 1 },
              pendingTickets: {
                $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] },
              },
              processingTickets: {
                $sum: {
                  $cond: [
                    { $in: ["$status", PROCESSING_STATUSES] },
                    1,
                    0,
                  ],
                },
              },
              completedTickets: {
                $sum: {
                  $cond: [
                    { $in: ["$status", COMPLETED_STATUSES] },
                    1,
                    0,
                  ],
                },
              },
              urgentTickets: {
                $sum: { $cond: [{ $eq: ["$priority", "urgent"] }, 1, 0] },
              },
            },
          },
          { $project: { _id: 0 } },
        ],
        byStatus: [
          { $group: { _id: "$status", value: { $sum: 1 } } },
        ],
        byCategory: [
          { $group: { _id: "$category", value: { $sum: 1 } } },
        ],
      },
    },
  ]);
}

/**
 * Thống kê số ticket được tạo mới theo từng ngày trong khoảng thời gian chỉ định.
 *
 * @param {{startDate: Date, endExclusiveDate: Date}} range - Khoảng thời gian lọc `createdAt`.
 * @returns {Promise<Array<{_id: string, value: number}>>} Dữ liệu số lượng theo ngày `YYYY-MM-DD`.
 */
function getTicketCreationTrend(range) {
  return Ticket.aggregate([
    {
      $match: {
        createdAt: {
          $gte: range.startDate,
          $lt: range.endExclusiveDate,
        },
      },
    },
    {
      $group: {
        _id: {
          $dateToString: {
            date: "$createdAt",
            format: "%Y-%m-%d",
            timezone: DASHBOARD_TIME_ZONE,
          },
        },
        value: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);
}

/**
 * Thống kê số ticket đã hoàn thành (`resolved` hoặc `closed`) theo từng ngày giải quyết (`resolvedAt`).
 *
 * @param {{startDate: Date, endExclusiveDate: Date}} range - Khoảng thời gian lọc `resolvedAt`.
 * @returns {Promise<Array<{_id: string, value: number}>>} Dữ liệu số lượng theo ngày `YYYY-MM-DD`.
 */
function getTicketResolutionTrend(range) {
  return Ticket.aggregate([
    { $match: { status: { $in: COMPLETED_STATUSES }, resolvedAt: { $gte: range.startDate, $lt: range.endExclusiveDate } } },
    { $group: { _id: { $dateToString: { date: "$resolvedAt", format: "%Y-%m-%d", timezone: DASHBOARD_TIME_ZONE } }, value: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);
}

/**
 * Tính tổng số lượt đánh giá và điểm đánh giá trung bình toàn hệ thống từ collection `Rating`.
 *
 * @returns {Promise<Array<{ratingCount: number, averageScore: number}>>} Kết quả aggregation điểm đánh giá.
 */
function getRatingStatistics() {
  return Rating.aggregate([
    {
      $group: {
        _id: null,
        ratingCount: { $sum: 1 },
        averageScore: { $avg: "$score" },
      },
    },
    { $project: { _id: 0 } },
  ]);
}

/**
 * Tính thời gian giải quyết trung bình (SLA từ `createdAt` đến `resolvedAt`) trên các ticket đã hoàn thành hợp lệ.
 *
 * @returns {Promise<Array<{sampleSize: number, averageMilliseconds: number}>>} Kết quả aggregation thời gian xử lý trung bình.
 */
function getResolutionStatistics() {
  return Ticket.aggregate([
    {
      $match: {
        status: { $in: COMPLETED_STATUSES },
        resolvedAt: { $type: "date" },
      },
    },
    // Chỉ tính các ticket có mốc resolvedAt >= createdAt để tránh sai số dữ liệu
    {
      $match: {
        $expr: { $gte: ["$resolvedAt", "$createdAt"] },
      },
    },
    {
      $group: {
        _id: null,
        sampleSize: { $sum: 1 },
        averageMilliseconds: {
          $avg: { $subtract: ["$resolvedAt", "$createdAt"] },
        },
      },
    },
    { $project: { _id: 0 } },
  ]);
}

/**
 * Ghép kết quả đếm ticket theo danh mục vào danh sách toàn bộ `Category`, gom ticket mồ côi vào nhóm "Không xác định".
 *
 * @param {Array} categories - Danh sách toàn bộ danh mục trong DB.
 * @param {Array} categoryRows - Kết quả aggregation đếm theo `$category`.
 * @returns {Array} Mảng thống kê danh mục sắp xếp theo số lượng giảm dần, rồi tên tiếng Việt.
 */
function mergeCategoryStatistics(categories, categoryRows) {
  const countByCategory = new Map(
    (categoryRows ?? []).map((row) => [String(row._id), Number(row.value)]),
  );
  const knownCategoryIds = new Set(
    categories.map((category) => String(category._id)),
  );
  let unknownCount = 0;

  // Cộng dồn các ticket có category bị xóa hoặc rỗng vào nhóm "Không xác định"
  for (const row of categoryRows ?? []) {
    if (!row._id || !knownCategoryIds.has(String(row._id))) {
      unknownCount += Number(row.value ?? 0);
    }
  }

  const result = categories.map((category) => ({
    categoryId: category._id,
    key: category.slug,
    name: category.name,
    value: countByCategory.get(String(category._id)) ?? 0,
  }));

  if (unknownCount > 0) {
    result.push({
      categoryId: null,
      key: "unknown",
      name: "Không xác định",
      value: unknownCount,
    });
  }

  return result.sort(
    (left, right) =>
      right.value - left.value || left.name.localeCompare(right.name, "vi"),
  );
}

/**
 * Thống kê khối lượng công việc (đang xử lý / đã hoàn thành) của toàn bộ kỹ thuật viên.
 *
 * @returns {Promise<Array>} Danh sách hiệu suất kỹ thuật viên sắp xếp theo số lượng đang xử lý giảm dần.
 */
async function getTechnicianPerformance() {
  const [technicians, ticketStatistics] = await Promise.all([
    User.find({ role: "technician" })
      .select("fullName")
      .sort({ fullName: 1, _id: 1 })
      .lean(),
    Ticket.aggregate([
      { $match: { assignedTo: { $ne: null } } },
      {
        $group: {
          _id: "$assignedTo",
          inProgress: {
            $sum: {
              $cond: [
                { $in: ["$status", PROCESSING_STATUSES] },
                1,
                0,
              ],
            },
          },
          completed: {
            $sum: {
              $cond: [
                { $in: ["$status", COMPLETED_STATUSES] },
                1,
                0,
              ],
            },
          },
        },
      },
    ]),
  ]);
  const statisticsByTechnician = new Map(
    ticketStatistics.map((item) => [String(item._id), item]),
  );

  return technicians
    .map((technician) => {
      const statistics = statisticsByTechnician.get(String(technician._id));

      return {
        technicianId: technician._id,
        name: technician.fullName,
        inProgress: Number(statistics?.inProgress ?? 0),
        completed: Number(statistics?.completed ?? 0),
      };
    })
    .sort(
      (left, right) =>
        right.inProgress - left.inProgress ||
        right.completed - left.completed ||
        left.name.localeCompare(right.name, "vi"),
    );
}

/**
 * Lấy 5 ticket mới nhất toàn hệ thống kèm nhãn trạng thái/độ ưu tiên tiếng Việt cho Admin dashboard.
 *
 * @returns {Promise<Array>} Danh sách 5 ticket mới nhất đã định dạng.
 */
async function getLatestTickets() {
  const tickets = await Ticket.find()
    .select(
      "ticketCode title status priority category createdBy assignedTo " +
        "createdAt lastActivityAt",
    )
    .populate({ path: "category", select: "name" })
    .populate({ path: "createdBy", select: "fullName" })
    .populate({ path: "assignedTo", select: "fullName" })
    .sort({ createdAt: -1, _id: -1 })
    .limit(5)
    .lean();

  return tickets.map((ticket) => ({
    id: ticket._id,
    ticketCode: ticket.ticketCode,
    title: ticket.title,
    status: ticket.status,
    statusLabel:
      STATUS_DEFINITIONS.find((item) => item.key === ticket.status)?.name ??
      ticket.status,
    priority: ticket.priority,
    priorityLabel: PRIORITY_LABELS[ticket.priority] ?? ticket.priority,
    createdAt: ticket.createdAt,
    lastActivityAt: ticket.lastActivityAt,
    category: ticket.category
      ? { id: ticket.category._id, name: ticket.category.name }
      : null,
    requester: ticket.createdBy
      ? { id: ticket.createdBy._id, fullName: ticket.createdBy.fullName }
      : null,
    assignedTo: ticket.assignedTo
      ? { id: ticket.assignedTo._id, fullName: ticket.assignedTo.fullName }
      : null,
  }));
}

/**
 * Tổng hợp toàn bộ dữ liệu Dashboard cho Quản trị viên (KPI, biểu đồ xu hướng 7 ngày,
 * phân bố danh mục/trạng thái, hiệu suất kỹ thuật viên và 5 ticket mới nhất).
 *
 * @param {Date|string|number} [referenceDate=new Date()] - Ngày tham chiếu để tính khoảng thống kê.
 * @returns {Promise<Object>} Payload dữ liệu tổng quan Admin dashboard.
 * @throws {TypeError} Nếu ngày tham chiếu không hợp lệ.
 */
export async function getAdminDashboard(referenceDate = new Date()) {
  const normalizedReferenceDate =
    referenceDate instanceof Date ? new Date(referenceDate) : new Date(referenceDate);

  if (Number.isNaN(normalizedReferenceDate.getTime())) {
    throw new TypeError("Ngày tham chiếu dashboard không hợp lệ.");
  }

  const range = getVietnamDateRange(normalizedReferenceDate);
  // Chạy song song toàn bộ các truy vấn aggregation và danh mục để tối ưu tốc độ tải dashboard
  const [
    snapshotResult,
    creationTrend,
    resolutionTrend,
    resolutionResult,
    ratingResult,
    categories,
    technicianPerformance,
    latestTickets,
  ] = await Promise.all([
    getTicketSnapshot(),
    getTicketCreationTrend(range),
    getTicketResolutionTrend(range),
    getResolutionStatistics(),
    getRatingStatistics(),
    Category.find().select("name slug").sort({ name: 1, _id: 1 }).lean(),
    getTechnicianPerformance(),
    getLatestTickets(),
  ]);
  const snapshot = snapshotResult[0] ?? {};
  const rawSummary = snapshot.summary?.[0] ?? {};
  const resolutionStats = resolutionResult[0] ?? {};
  const ratingStats = ratingResult[0] ?? {};
  const ticketsByStatus = fillEnumSeries(
    snapshot.byStatus,
    STATUS_DEFINITIONS,
  );
  const ticketsCreatedLast7Days = buildLastNDaysSeries(
    creationTrend,
    {
      now: normalizedReferenceDate,
      days: 7,
      timeZone: DASHBOARD_TIME_ZONE,
    },
  );
  const ticketsResolvedLast7Days = buildLastNDaysSeries(resolutionTrend, { now: normalizedReferenceDate, days: 7, timeZone: DASHBOARD_TIME_ZONE });

  return {
    generatedAt: normalizedReferenceDate,
    timeZone: DASHBOARD_TIME_ZONE,
    trendPeriod: {
      days: 7,
      from: range.from,
      to: range.to,
    },
    definitions: {
      processingStatuses: [...PROCESSING_STATUSES],
      completedStatuses: [...COMPLETED_STATUSES],
      averageResolutionTimeBasis: "createdAt_to_resolvedAt",
    },
    summary: normalizeDashboardSummary(rawSummary, resolutionStats, ratingStats),
    charts: {
      ticketsByCategory: mergeCategoryStatistics(
        categories,
        snapshot.byCategory,
      ),
      ticketsByStatus,
      ticketsCreatedLast7Days,
      ticketsResolvedLast7Days,
      technicianPerformance,
    },
    latestTickets,
  };
}

const TECHNICIAN_ACTIVE_STATUSES = Object.freeze([
  "assigned",
  "in_progress",
  "waiting_user",
]);

const TECHNICIAN_PRIORITY_WEIGHT = Object.freeze({
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
});

/**
 * Chuẩn hóa đối tượng ticket cần xử lý cho danh sách công việc trên Dashboard Kỹ thuật viên.
 *
 * @param {Object} ticket - Document ticket lean đã populate `createdBy`.
 * @returns {Object} Đối tượng ticket rút gọn hiển thị trên bảng việc cần làm.
 */
function serializeTechnicianWorkTicket(ticket) {
  return {
    id: ticket._id,
    ticketCode: ticket.ticketCode,
    title: ticket.title,
    priority: ticket.priority,
    status: ticket.status,
    createdAt: ticket.createdAt,
    lastActivityAt: ticket.lastActivityAt,
    requester: ticket.createdBy
      ? { id: ticket.createdBy._id, fullName: ticket.createdBy.fullName }
      : null,
  };
}

/**
 * Tổng hợp KPI xử lý ticket theo ngày/tuần/tháng và Top 5 ticket ưu tiên cho Kỹ thuật viên.
 *
 * @param {string|import("mongoose").Types.ObjectId} technicianId - ID tài khoản kỹ thuật viên.
 * @param {Date|string|number} [referenceDate=new Date()] - Ngày tham chiếu tính mốc thời gian.
 * @returns {Promise<Object>} Payload gồm `summary` (tỷ lệ hoàn thành, số lượng theo trạng thái) và `workTickets`.
 * @throws {TypeError} Nếu ngày tham chiếu không hợp lệ.
 */
export async function getTechnicianDashboard(technicianId, referenceDate = new Date()) {
  const normalizedReferenceDate =
    referenceDate instanceof Date ? new Date(referenceDate) : new Date(referenceDate);

  if (Number.isNaN(normalizedReferenceDate.getTime())) {
    throw new TypeError("Ngày tham chiếu dashboard không hợp lệ.");
  }

  const ranges = getTechnicianDashboardRanges(normalizedReferenceDate);
  const assignedTo = technicianId;
  const completedThisWeekFilter = {
    assignedTo,
    status: { $in: COMPLETED_STATUSES },
    resolvedAt: { $gte: ranges.week.startDate, $lt: ranges.week.endExclusiveDate },
  };
  const monthlyCompletedFilter = {
    assignedTo,
    status: { $in: COMPLETED_STATUSES },
    resolvedAt: { $gte: ranges.month.startDate, $lt: ranges.month.endExclusiveDate },
  };

  // Đếm song song tất cả các chỉ số KPI cá nhân và tải tối đa 30 ticket đang mở để xếp hạng ưu tiên
  const [
    assignedTickets,
    assignedToday,
    inProgressTickets,
    waitingUserTickets,
    urgentTickets,
    completedThisWeek,
    assignedThisMonth,
    completedThisMonth,
    workTickets,
  ] = await Promise.all([
    Ticket.countDocuments({ assignedTo, status: "assigned" }),
    Ticket.countDocuments({
      assignedTo,
      assignedAt: { $gte: ranges.today.startDate, $lt: ranges.today.endExclusiveDate },
    }),
    Ticket.countDocuments({ assignedTo, status: "in_progress" }),
    Ticket.countDocuments({ assignedTo, status: "waiting_user" }),
    Ticket.countDocuments({
      assignedTo,
      status: { $in: TECHNICIAN_ACTIVE_STATUSES },
      priority: "urgent",
    }),
    Ticket.countDocuments(completedThisWeekFilter),
    Ticket.countDocuments({
      assignedTo,
      assignedAt: { $gte: ranges.month.startDate, $lt: ranges.month.endExclusiveDate },
    }),
    Ticket.countDocuments(monthlyCompletedFilter),
    Ticket.find({ assignedTo, status: { $in: TECHNICIAN_ACTIVE_STATUSES } })
      .select("ticketCode title priority status createdAt lastActivityAt createdBy")
      .populate({ path: "createdBy", select: "fullName" })
      .sort({ lastActivityAt: -1, _id: -1 })
      .limit(30)
      .lean(),
  ]);

  // Tính tỷ lệ hoàn thành trong tháng (%)
  const completionRate =
    assignedThisMonth > 0
      ? Math.round((completedThisMonth / assignedThisMonth) * 100)
      : 0;
  // Sắp xếp theo mức độ khẩn cấp (urgent -> low), cùng mức ưu tiên thì hoạt động mới nhất lên trước, lấy Top 5
  const priorityWorkTickets = workTickets
    .sort(
      (left, right) =>
        TECHNICIAN_PRIORITY_WEIGHT[left.priority] -
          TECHNICIAN_PRIORITY_WEIGHT[right.priority] ||
        new Date(right.lastActivityAt).getTime() -
          new Date(left.lastActivityAt).getTime(),
    )
    .slice(0, 5)
    .map(serializeTechnicianWorkTicket);

  return {
    generatedAt: normalizedReferenceDate,
    timeZone: DASHBOARD_TIME_ZONE,
    summary: {
      assignedTickets,
      assignedToday,
      inProgressTickets,
      waitingUserTickets,
      urgentTickets,
      completedThisWeek,
      assignedThisMonth,
      completedThisMonth,
      completionRate,
    },
    workTickets: priorityWorkTickets,
  };
}

/**
 * Tổng hợp thống kê ticket đã gửi và 5 ticket hoạt động gần nhất cho Người dùng cuối (`user`).
 *
 * @param {string|import("mongoose").Types.ObjectId} userId - ID người dùng cuối.
 * @param {Date} [referenceDate=new Date()] - Ngày tham chiếu phản hồi.
 * @returns {Promise<Object>} Payload gồm `summary` (tổng, đang xử lý, chờ phản hồi, hoàn thành) và `recentTickets`.
 */
export async function getUserDashboard(userId, referenceDate = new Date()) {
  const createdBy = userId;
  const [summaryRows, recentTickets] = await Promise.all([
    Ticket.aggregate([
      { $match: { createdBy } },
      {
        $group: {
          _id: null,
          totalTickets: { $sum: 1 },
          processingTickets: {
            $sum: { $cond: [{ $in: ["$status", PROCESSING_STATUSES] }, 1, 0] },
          },
          waitingUserTickets: {
            $sum: { $cond: [{ $eq: ["$status", "waiting_user"] }, 1, 0] },
          },
          completedTickets: {
            $sum: { $cond: [{ $in: ["$status", COMPLETED_STATUSES] }, 1, 0] },
          },
        },
      },
      { $project: { _id: 0 } },
    ]),
    Ticket.find({ createdBy })
      .select("ticketCode title category priority status assignedTo createdAt lastActivityAt")
      .populate({ path: "category", select: "name slug" })
      .populate({ path: "assignedTo", select: "fullName" })
      .sort({ lastActivityAt: -1, _id: -1 })
      .limit(5)
      .lean(),
  ]);
  const summary = summaryRows[0] ?? {};

  return {
    generatedAt: referenceDate,
    timeZone: DASHBOARD_TIME_ZONE,
    summary: {
      totalTickets: Number(summary.totalTickets ?? 0),
      processingTickets: Number(summary.processingTickets ?? 0),
      waitingUserTickets: Number(summary.waitingUserTickets ?? 0),
      completedTickets: Number(summary.completedTickets ?? 0),
    },
    recentTickets: recentTickets.map((ticket) => ({
      ...ticket,
      category: ticket.category
        ? { _id: ticket.category._id, name: ticket.category.name, slug: ticket.category.slug }
        : null,
      assignedTo: ticket.assignedTo
        ? { _id: ticket.assignedTo._id, fullName: ticket.assignedTo.fullName }
        : null,
    })),
  };
}

export const DASHBOARD_STATUS_DEFINITIONS = STATUS_DEFINITIONS;
export const DASHBOARD_PRIORITY_KEYS = TICKET_PRIORITIES;
export const DASHBOARD_STATUS_KEYS = TICKET_STATUSES;
