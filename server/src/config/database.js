/**
 * @file database.js
 * @description Cấu hình kết nối PostgreSQL và cung cấp tầng ODM tương thích Mongoose (`Schema`, `createModel`, `QueryBuilder`, `aggregate`).
 * Vai trò trong kiến trúc Backend:
 * - Quản lý Connection Pool tới PostgreSQL (`pg.Pool`), tự động tạo database nếu chưa tồn tại (mã lỗi `3D000`)
 *   và thực thi DDL khởi tạo toàn bộ bảng, khóa ngoại và chỉ mục (`SCHEMA_SQL`).
 * - Cung cấp lớp `Schema`, `PgDocument`, `QueryBuilder` và `PgModel` giúp các Model/Service/Controller
 *   sử dụng cú pháp quen thuộc (`find`, `findOne`, `findById`, `populate`, `lean`, `save`, `aggregate`...)
 *   trên nền tảng PostgreSQL quan hệ và cột JSONB.
 */
import crypto from "node:crypto";
import pg from "pg";
import { env } from "./env.js";

const { Pool } = pg;

/** Biểu thức chính quy kiểm tra chuỗi ID hex 24 ký tự (tương thích định dạng ObjectId 12 byte). */
const OBJECT_ID_REGEX = /^[a-fA-F0-9]{24}$/;

/**
 * Polyfill `String.prototype.equals` mô phỏng phương thức `.equals()` của ObjectId trong Mongoose.
 * Cho phép so sánh ID dạng chuỗi với chuỗi khác hoặc đối tượng có thuộc tính `_id`.
 */
if (!Object.hasOwn(String.prototype, "equals")) {
  Object.defineProperty(String.prototype, "equals", {
    value(other) {
      if (other === null || other === undefined) {
        return false;
      }
      const otherId =
        typeof other === "object" && "_id" in other ? other._id : other;
      return String(this) === String(otherId);
    },
    configurable: true,
    writable: true,
  });
}

/**
 * Polyfill `Array.prototype.id` mô phỏng helper `.id()` trên mảng subdocument của Mongoose.
 * Tìm kiếm phần tử đầu tiên có `_id` hoặc `id` khớp với `targetId` sau khi chuẩn hóa về chuỗi.
 */
if (!Object.hasOwn(Array.prototype, "id")) {
  Object.defineProperty(Array.prototype, "id", {
    value(targetId) {
      if (targetId === null || targetId === undefined) {
        return null;
      }
      const normalized = String(targetId);
      return (
        this.find(
          (item) => item && String(item._id ?? item.id) === normalized,
        ) ?? null
      );
    },
    configurable: true,
    writable: true,
  });
}

/**
 * Sinh mã định danh duy nhất 24 ký tự hex (12 byte ngẫu nhiên) tương thích với chuẩn độ dài `VARCHAR(24)`.
 * @returns {string} Chuỗi ID hex 24 ký tự.
 */
export function generateId() {
  return crypto.randomBytes(12).toString("hex");
}

/**
 * Kiểm tra giá trị đầu vào có phải chuỗi ID hex 24 ký tự hợp lệ hay không.
 * @param {*} value - Giá trị cần kiểm tra.
 * @returns {boolean} `true` nếu hợp lệ, ngược lại `false`.
 */
export function isValidId(value) {
  return typeof value === "string" && OBJECT_ID_REGEX.test(value);
}

/**
 * Trích xuất tên database PostgreSQL từ chuỗi kết nối `env.databaseUrl`.
 * @returns {string} Tên database đã giải mã URL hoặc chuỗi rỗng nếu URL không hợp lệ/chưa cấu hình.
 */
export function getDatabaseName() {
  if (!env.databaseUrl) {
    return "";
  }
  try {
    const parsed = new URL(env.databaseUrl);
    return decodeURIComponent(parsed.pathname.replace(/^\/+/, "").split("/")[0] || "");
  } catch {
    return "";
  }
}

/** Đối tượng đại diện thông tin kết nối hiện tại (tương thích interface `mongoose.connection.name`). */
export const dbConnection = {
  get name() {
    return getDatabaseName();
  },
};

/** Instance singleton của PostgreSQL Connection Pool. */
let pool = null;

/**
 * Lấy hoặc khởi tạo singleton `pg.Pool` dùng chung cho toàn bộ truy vấn SQL.
 * Luồng xử lý: Nếu `pool` chưa tồn tại, kiểm tra `env.databaseUrl` và tạo Pool mới
 * với giới hạn tối đa 20 kết nối, timeout nhàn rỗi 30s và timeout kết nối 5s.
 * @throws {Error} Ném lỗi nếu thiếu `DATABASE_URL`.
 * @returns {import("pg").Pool} Đối tượng PostgreSQL connection pool đang hoạt động.
 */
export function getPool() {
  if (!pool) {
    if (!env.databaseUrl) {
      throw new Error("Thiếu biến môi trường DATABASE_URL.");
    }
    pool = new Pool({
      connectionString: env.databaseUrl,
      max: 20,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
  }
  return pool;
}

/**
 * Chuỗi DDL SQL khởi tạo toàn bộ cấu trúc bảng và chỉ mục cho PostgreSQL nếu chưa tồn tại:
 * - `users`, `categories`, `ticket_counters`, `tickets`, `comments`, `ratings` (phân hệ Helpdesk Ticket)
 * - `assets`, `asset_requests` (phân hệ Quản lý Tài sản IT)
 * - `software_licenses` (phân hệ Quản lý Bản quyền Phần mềm)
 * - `usb_devices`, `usb_event_logs` (phân hệ Giám sát & Bảo mật USB)
 */
const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(24) PRIMARY KEY,
  full_name VARCHAR(100) NOT NULL,
  email VARCHAR(254) NOT NULL UNIQUE,
  password TEXT NOT NULL,
  phone VARCHAR(20),
  department VARCHAR(100),
  avatar VARCHAR(500),
  role VARCHAR(20) NOT NULL DEFAULT 'user',
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  last_login_at TIMESTAMPTZ,
  password_changed_at TIMESTAMPTZ,
  token_version INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_users_role_status ON users (role, status);

CREATE TABLE IF NOT EXISTS categories (
  id VARCHAR(24) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(120) NOT NULL UNIQUE,
  description VARCHAR(500),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by VARCHAR(24) REFERENCES users(id) ON DELETE SET NULL,
  updated_by VARCHAR(24) REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_categories_active_name ON categories (is_active, name);

CREATE TABLE IF NOT EXISTS ticket_counters (
  id VARCHAR(100) PRIMARY KEY,
  year INTEGER NOT NULL,
  sequence INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tickets (
  id VARCHAR(24) PRIMARY KEY,
  ticket_code VARCHAR(32) NOT NULL UNIQUE,
  title VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  category VARCHAR(24) NOT NULL REFERENCES categories(id),
  priority VARCHAR(20) NOT NULL DEFAULT 'medium',
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_by VARCHAR(24) NOT NULL REFERENCES users(id),
  assigned_to VARCHAR(24) REFERENCES users(id),
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  resolution TEXT,
  assigned_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  waiting_user_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancelled_by VARCHAR(24) REFERENCES users(id),
  cancellation_reason VARCHAR(500),
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  assignment_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  version INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tickets_created_by_created_at ON tickets (created_by, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_assigned_status_created_at ON tickets (assigned_to, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_status_priority_created_at ON tickets (status, priority, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_category_status_created_at ON tickets (category, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_status_resolved_at ON tickets (status, resolved_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_created_at ON tickets (created_at DESC);

CREATE TABLE IF NOT EXISTS comments (
  id VARCHAR(24) PRIMARY KEY,
  ticket VARCHAR(24) NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  sender VARCHAR(24) NOT NULL REFERENCES users(id),
  content TEXT NOT NULL,
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_internal BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_comments_ticket_created ON comments (ticket, created_at ASC, id ASC);
CREATE INDEX IF NOT EXISTS idx_comments_ticket_internal_created ON comments (ticket, is_internal, created_at ASC, id ASC);

CREATE TABLE IF NOT EXISTS ratings (
  id VARCHAR(24) PRIMARY KEY,
  ticket VARCHAR(24) NOT NULL UNIQUE REFERENCES tickets(id) ON DELETE CASCADE,
  rated_by VARCHAR(24) NOT NULL REFERENCES users(id),
  technician VARCHAR(24) NOT NULL REFERENCES users(id),
  score INTEGER NOT NULL,
  feedback VARCHAR(1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ratings_technician_created ON ratings (technician, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ratings_rated_by_created ON ratings (rated_by, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ratings_score_created ON ratings (score, created_at DESC);

CREATE TABLE IF NOT EXISTS assets (
  id VARCHAR(24) PRIMARY KEY,
  asset_tag VARCHAR(40) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  type VARCHAR(20) NOT NULL DEFAULT 'laptop',
  serial_number VARCHAR(80),
  specs VARCHAR(300),
  os VARCHAR(80),
  status VARCHAR(20) NOT NULL DEFAULT 'in_stock',
  assigned_to VARCHAR(24) REFERENCES users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ,
  remote_tool VARCHAR(20) NOT NULL DEFAULT 'none',
  remote_id VARCHAR(60),
  purchase_date TIMESTAMPTZ,
  notes VARCHAR(500),
  history JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_assets_type ON assets (type);
CREATE INDEX IF NOT EXISTS idx_assets_status ON assets (status);
CREATE INDEX IF NOT EXISTS idx_assets_assigned_to ON assets (assigned_to);

CREATE TABLE IF NOT EXISTS asset_requests (
  id VARCHAR(24) PRIMARY KEY,
  request_code VARCHAR(40) NOT NULL UNIQUE,
  employee VARCHAR(24) NOT NULL REFERENCES users(id),
  asset_type VARCHAR(20) NOT NULL DEFAULT 'laptop',
  note VARCHAR(1000),
  requested_by VARCHAR(24) NOT NULL REFERENCES users(id),
  technician VARCHAR(24) REFERENCES users(id) ON DELETE SET NULL,
  asset VARCHAR(24) REFERENCES assets(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  accepted_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancel_reason VARCHAR(500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_asset_requests_employee ON asset_requests (employee);
CREATE INDEX IF NOT EXISTS idx_asset_requests_technician ON asset_requests (technician);
CREATE INDEX IF NOT EXISTS idx_asset_requests_status ON asset_requests (status);

CREATE TABLE IF NOT EXISTS software_licenses (
  id VARCHAR(24) PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  vendor VARCHAR(100) NOT NULL,
  category VARCHAR(80) NOT NULL DEFAULT 'Văn phòng & Email',
  type VARCHAR(30) NOT NULL DEFAULT 'saas_subscription',
  license_key VARCHAR(300),
  portal_url VARCHAR(255),
  total_seats INTEGER NOT NULL,
  cost_per_seat DOUBLE PRECISION NOT NULL DEFAULT 0,
  currency VARCHAR(10) NOT NULL DEFAULT 'VND',
  billing_cycle VARCHAR(20) NOT NULL DEFAULT 'yearly',
  purchase_date TIMESTAMPTZ,
  expiry_date TIMESTAMPTZ,
  assigned_users JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes VARCHAR(1000),
  created_by VARCHAR(24) REFERENCES users(id) ON DELETE SET NULL,
  updated_by VARCHAR(24) REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_software_category ON software_licenses (category);
CREATE INDEX IF NOT EXISTS idx_software_type ON software_licenses (type);
CREATE INDEX IF NOT EXISTS idx_software_expiry_date ON software_licenses (expiry_date);

CREATE TABLE IF NOT EXISTS usb_devices (
  id VARCHAR(24) PRIMARY KEY,
  device_id VARCHAR(255) NOT NULL UNIQUE,
  device_name VARCHAR(200) NOT NULL,
  vendor VARCHAR(120) DEFAULT 'Unknown Vendor',
  serial_number VARCHAR(120),
  device_type VARCHAR(30) NOT NULL DEFAULT 'storage',
  drive_letter VARCHAR(20),
  volume_name VARCHAR(120),
  status VARCHAR(20) NOT NULL DEFAULT 'unverified',
  is_currently_connected BOOLEAN NOT NULL DEFAULT FALSE,
  last_host JSONB NOT NULL DEFAULT '{}'::jsonb,
  assigned_user VARCHAR(24) REFERENCES users(id) ON DELETE SET NULL,
  reviewed_by VARCHAR(24) REFERENCES users(id) ON DELETE SET NULL,
  note VARCHAR(1000),
  connection_count INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_usb_devices_status_conn_updated ON usb_devices (status, is_currently_connected DESC, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_usb_devices_last_host_hostname ON usb_devices ((last_host->>'hostname'));

CREATE TABLE IF NOT EXISTS usb_event_logs (
  id VARCHAR(24) PRIMARY KEY,
  usb_device VARCHAR(24) NOT NULL REFERENCES usb_devices(id) ON DELETE CASCADE,
  device_id VARCHAR(255) NOT NULL,
  device_name VARCHAR(200) NOT NULL,
  vendor VARCHAR(120) DEFAULT 'Unknown Vendor',
  serial_number VARCHAR(120),
  device_type VARCHAR(30) NOT NULL DEFAULT 'storage',
  drive_letter VARCHAR(20),
  volume_name VARCHAR(120),
  event_type VARCHAR(20) NOT NULL,
  device_status_at_event VARCHAR(20) NOT NULL DEFAULT 'unverified',
  hostname VARCHAR(120) NOT NULL,
  os_username VARCHAR(120),
  ip_address VARCHAR(80),
  agent_version VARCHAR(40) DEFAULT '1.0.0-win64',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_usb_event_logs_device ON usb_event_logs (usb_device);
CREATE INDEX IF NOT EXISTS idx_usb_event_logs_created_at ON usb_event_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usb_event_logs_hostname_created ON usb_event_logs (hostname, created_at DESC);
`;

/**
 * Đảm bảo database mục tiêu trên PostgreSQL tồn tại trước khi chạy schema DDL.
 * Luồng xử lý:
 * 1. Thử kết nối trực tiếp vào `env.databaseUrl`.
 * 2. Nếu PostgreSQL báo lỗi `3D000` (database does not exist), kết nối tạm sang database hệ thống `/postgres`
 *    để kiểm tra và tự động chạy `CREATE DATABASE` tạo mới database mục tiêu.
 * 3. Thử kết nối lại vào pool chính để xác nhận database đã sẵn sàng.
 * @returns {Promise<void>}
 */
async function ensureDatabaseExists() {
  const activePool = getPool();
  try {
    const client = await activePool.connect();
    client.release();
    return;
  } catch (error) {
    // Mã lỗi 3D000 trong PostgreSQL tương ứng với "invalid_catalog_name" (database chưa tồn tại)
    if (error.code !== "3D000") {
      throw error;
    }

    const dbName = getDatabaseName();
    if (!dbName) {
      throw error;
    }

    // Chuyển đường dẫn URL sang database mặc định /postgres để có quyền tạo database mới
    const parsed = new URL(env.databaseUrl);
    parsed.pathname = "/postgres";

    const adminPool = new Pool({
      connectionString: parsed.toString(),
      max: 1,
      connectionTimeoutMillis: 5_000,
    });

    try {
      const existing = await adminPool.query(
        "SELECT 1 FROM pg_database WHERE datname = $1",
        [dbName],
      );
      if (existing.rowCount === 0) {
        // Escape dấu ngoặc kép trong tên DB để tránh SQL injection khi tạo identifier động
        const safeName = dbName.replace(/"/g, '""');
        await adminPool.query(`CREATE DATABASE "${safeName}"`);
        console.log(`Đã tự động tạo PostgreSQL database: ${dbName}`);
      }
    } finally {
      await adminPool.end();
    }

    // Xác minh kết nối lại tới database vừa tạo
    const retryClient = await activePool.connect();
    retryClient.release();
  }
}

/**
 * Kết nối tới PostgreSQL và khởi tạo toàn bộ bảng/chỉ mục hệ thống.
 * @throws {Error} Ném lỗi có ngữ cảnh nếu kết nối hoặc chạy DDL thất bại.
 * @returns {Promise<import("pg").Pool>} Pool kết nối đang hoạt động.
 */
export async function connectDatabase() {
  try {
    await ensureDatabaseExists();
    await getPool().query(SCHEMA_SQL);
    const parsed = new URL(env.databaseUrl);
    console.log(
      `PostgreSQL đã kết nối: ${parsed.hostname}:${parsed.port || 5432}/${getDatabaseName()}`,
    );
    return getPool();
  } catch (error) {
    throw new Error(`Không thể kết nối PostgreSQL: ${error.message}`, {
      cause: error,
    });
  }
}

/**
 * Đóng toàn bộ kết nối trong `pg.Pool` và giải phóng biến `pool` khi tắt server hoặc script.
 * @returns {Promise<void>}
 */
export async function disconnectDatabase() {
  try {
    if (pool) {
      await pool.end();
      pool = null;
      console.log("PostgreSQL đã ngắt kết nối.");
    }
  } catch (error) {
    throw new Error(`Không thể ngắt kết nối PostgreSQL: ${error.message}`, {
      cause: error,
    });
  }
}

/* --------------------- Schema & Model Engine (pg) --------------------- */

/**
 * Chuyển đổi tên thuộc tính camelCase (hoặc `_id`, `__v`) sang tên cột snake_case trong PostgreSQL.
 * @param {string} fieldName - Tên trường ở tầng JavaScript/Schema.
 * @returns {string} Tên cột tương ứng trong bảng PostgreSQL.
 */
function toSnakeCase(fieldName) {
  if (fieldName === "_id") return "id";
  if (fieldName === "__v") return "version";
  return fieldName.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

/**
 * Suy ra tên bảng PostgreSQL mặc định từ tên Model theo quy ước số nhiều tiếng Anh.
 * Ví dụ: `"Category"` -> `"categories"`, `"Ticket"` -> `"tickets"`.
 * @param {string} modelName - Tên Model.
 * @returns {string} Tên bảng mặc định trong PostgreSQL.
 */
function defaultTableName(modelName) {
  const snake = modelName
    .replace(/^[A-Z]/, (c) => c.toLowerCase())
    .replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
  if (snake.endsWith("y") && !/[aeiou]y$/.test(snake)) {
    return `${snake.slice(0, -1)}ies`;
  }
  return `${snake}s`;
}

/**
 * Chuẩn hóa đặc tả trường trong Schema về dạng object `{ type, ... }`.
 * Hỗ trợ dạng viết tắt (`String`, `[SubSchema]`, hoặc nested object literal).
 * @param {*} spec - Định nghĩa trường thô truyền vào `new Schema(...)`.
 * @returns {Object} Đặc tả trường đã chuẩn hóa.
 */
function normalizeFieldSpec(spec) {
  if (!spec || typeof spec !== "object" || spec instanceof Schema) {
    return { type: spec };
  }
  if (Array.isArray(spec)) {
    return { type: spec };
  }
  // Nếu là object lồng nhau thuần túy (như lastHost), tự động bọc thành sub-Schema
  if (!("type" in spec) && !("ref" in spec) && !("default" in spec) && !("enum" in spec)) {
    return { type: new Schema(spec) };
  }
  return spec;
}

/**
 * Lớp định nghĩa cấu trúc Model tương thích API của `mongoose.Schema`.
 * Vai trò: Lưu trữ định nghĩa trường, tùy chọn (`timestamps`, `optimisticConcurrency`, `toJSON`, `toObject`),
 * các phương thức instance (`methods`) và hook trước khi lưu (`pre("save", ...)`).
 */
export class Schema {
  /** Tập hợp các kiểu dữ liệu chuẩn được hỗ trợ trong định nghĩa Schema. */
  static Types = Object.freeze({
    ObjectId: "ObjectId",
    String,
    Number,
    Boolean,
    Date,
  });

  /**
   * Khởi tạo Schema mới từ định nghĩa các trường và tùy chọn kèm theo.
   * @param {Object} definition - Đối tượng khai báo các trường và ràng buộc validation.
   * @param {Object} [options={}] - Tùy chọn schema (`timestamps`, `optimisticConcurrency`, `collection`, `_id`, `toJSON`, `toObject`).
   */
  constructor(definition, options = {}) {
    this.definition = definition;
    this.options = options;
    this.methods = {};
    this.preHooks = { save: [] };
    this.fields = {};

    for (const [key, rawSpec] of Object.entries(definition)) {
      this.fields[key] = normalizeFieldSpec(rawSpec);
    }

    // Tự động bổ sung createdAt và updatedAt khi bật tùy chọn timestamps
    if (options.timestamps) {
      if (!this.fields.createdAt) {
        this.fields.createdAt = { type: Date };
      }
      if (!this.fields.updatedAt) {
        this.fields.updatedAt = { type: Date };
      }
    }

    // Tự động bổ sung trường __v (ánh xạ sang cột version) cho Optimistic Concurrency Control
    if (options.optimisticConcurrency && !this.fields.__v) {
      this.fields.__v = { type: Number, default: 0 };
    }
  }

  /**
   * Phương thức giữ chỗ tương thích API `.index()` của Mongoose (chỉ mục thực tế quản lý trong `SCHEMA_SQL`).
   * @returns {Schema} Chính instance Schema để hỗ trợ gọi chuỗi.
   */
  index() {
    // Indexes are managed by PostgreSQL DDL in SCHEMA_SQL
    return this;
  }

  /**
   * Đăng ký middleware hook chạy trước một vòng đời (hiện hỗ trợ `"save"`, ví dụ: hash mật khẩu trước khi lưu).
   * @param {string} hookName - Tên hook (ví dụ: `"save"`).
   * @param {Function} fn - Hàm async/sync thực thi với `this` là document.
   * @returns {Schema} Chính instance Schema để hỗ trợ gọi chuỗi.
   */
  pre(hookName, fn) {
    if (!this.preHooks[hookName]) {
      this.preHooks[hookName] = [];
    }
    this.preHooks[hookName].push(fn);
    return this;
  }
}

/**
 * Ánh xạ mã lỗi PostgreSQL sang mã lỗi tương thích để `errorHandler` xử lý thống nhất.
 * Cụ thể: mã `23505` (unique_violation) được gán `error.code = 11000`.
 * @param {Error & {code?: string|number}} error - Lỗi gốc từ thư viện `pg`.
 * @returns {Error} Lỗi đã được chuẩn hóa mã.
 */
function mapPgError(error) {
  if (error?.code === "23505") {
    error.code = 11000;
  }
  return error;
}

/**
 * Tạo đối tượng `ValidationError` tương thích Mongoose từ bản đồ lỗi từng trường.
 * @param {Object<string, {message: string}>} errorsMap - Bản đồ lỗi theo đường dẫn trường.
 * @returns {Error & {name: string, errors: Object}} Đối tượng lỗi có `name = "ValidationError"`.
 */
function createValidationError(errorsMap) {
  const messages = Object.values(errorsMap).map((item) => item.message);
  const error = new Error(messages.join("; "));
  error.name = "ValidationError";
  error.errors = errorsMap;
  return error;
}

/**
 * Trích xuất cặp `[giá trị cấu hình, thông báo lỗi]` từ tùy chọn validation dạng tuple `[val, msg]`,
 * object `{ values, message }` hoặc giá trị đơn lẻ.
 * @param {*} option - Cấu hình rule trong Schema (`required`, `minlength`, `maxlength`, `match`, `min`, `max`).
 * @param {string} defaultMsg - Thông báo lỗi mặc định nếu rule không chỉ định thông báo riêng.
 * @returns {[*, string]} Mảng 2 phần tử `[ruleValue, errorMessage]`.
 */
function extractTupleOption(option, defaultMsg) {
  if (Array.isArray(option)) {
    return [option[0], option[1] ?? defaultMsg];
  }
  if (option && typeof option === "object" && "values" in option) {
    return [option.values, option.message ?? defaultMsg];
  }
  return [option, defaultMsg];
}

/**
 * Kiểm tra xem một trường Schema có được lưu trữ dưới dạng cột JSONB trong PostgreSQL hay không
 * (áp dụng cho mảng hoặc subdocument Schema lồng nhau).
 * @param {Object} spec - Đặc tả trường Schema.
 * @returns {boolean} `true` nếu trường là kiểu JSONB.
 */
function isJsonField(spec) {
  if (!spec) return false;
  if (Array.isArray(spec.type)) return true;
  if (spec.type instanceof Schema) return true;
  return false;
}

/**
 * Ép kiểu và chuẩn hóa giá trị đầu vào theo đặc tả `spec` của Schema
 * (trim, lowercase, uppercase cho String/ObjectId; ép kiểu Number, Boolean, Date; chuẩn hóa mảng/subdoc).
 * @param {*} value - Giá trị thô cần chuyển đổi.
 * @param {Object} spec - Đặc tả trường Schema.
 * @param {string} schemaFieldKey - Tên trường trong Schema.
 * @returns {*} Giá trị sau khi ép kiểu.
 */
function coerceValue(value, spec, schemaFieldKey) {
  if (value === undefined) return undefined;
  if (value === null) return null;

  if (Array.isArray(spec.type)) {
    const subSchema = spec.type[0];
    if (!Array.isArray(value)) return value;
    if (subSchema instanceof Schema) {
      return value.map((item) => normalizeSubdocObject(item, subSchema));
    }
    return value;
  }

  if (spec.type instanceof Schema) {
    if (typeof value !== "object") return value;
    return normalizeSubdocObject(value, spec.type);
  }

  if (spec.type === String || spec.type === Schema.Types.ObjectId) {
    let str = typeof value === "object" && "_id" in value ? String(value._id) : String(value);
    if (spec.trim) str = str.trim();
    if (spec.lowercase) str = str.toLowerCase();
    if (spec.uppercase) str = str.toUpperCase();
    return str;
  }

  if (spec.type === Number) {
    if (typeof value === "number") return value;
    if (typeof value === "string" && value.trim() !== "") {
      const num = Number(value);
      return Number.isNaN(num) ? value : num;
    }
    return value;
  }

  if (spec.type === Boolean) {
    if (typeof value === "boolean") return value;
    if (value === "true") return true;
    if (value === "false") return false;
    return Boolean(value);
  }

  if (spec.type === Date) {
    if (value instanceof Date) return value;
    if (typeof value === "string" || typeof value === "number") {
      const d = new Date(value);
      return Number.isNaN(d.getTime()) ? value : d;
    }
    return value;
  }

  void schemaFieldKey;
  return value;
}

/**
 * Tính toán giá trị mặc định (`default`) cho một trường Schema khi dữ liệu đầu vào là `undefined`.
 * @param {Object} spec - Đặc tả trường Schema.
 * @returns {*} Giá trị mặc định đã được sao chép/khởi tạo mới.
 */
function resolveDefault(spec) {
  if (!("default" in spec)) return undefined;
  const def = spec.default;
  if (def === Date.now) return new Date();
  if (typeof def === "function") return def();
  if (Array.isArray(def)) return [...def];
  if (def && typeof def === "object") return { ...def };
  return def;
}

/**
 * Chuẩn hóa một đối tượng subdocument theo `subSchema`: tự sinh `_id` (trừ khi `_id: false`),
 * điền giá trị mặc định và ép kiểu từng thuộc tính con.
 * @param {Object} input - Dữ liệu subdocument thô.
 * @param {Schema} subSchema - Schema mô tả cấu trúc subdocument.
 * @returns {Object} Subdocument đã được chuẩn hóa.
 */
function normalizeSubdocObject(input, subSchema) {
  const result = {};
  if (subSchema.options._id !== false) {
    result._id = input?._id ? String(input._id) : generateId();
  }
  for (const [key, spec] of Object.entries(subSchema.fields)) {
    if (key === "_id" && subSchema.options._id === false) continue;
    let val = input?.[key];
    if (val === undefined) {
      val = resolveDefault(spec);
    }
    if (val !== undefined) {
      val = coerceValue(val, spec, key);
    }
    if (val !== undefined) {
      result[key] = val;
    }
  }
  return result;
}

/**
 * Kiểm tra tính hợp lệ của một giá trị đối chiếu với toàn bộ rule trong `spec`
 * (`required`, subdocument đệ quy, kiểu `Date`/`Number`, `enum`, `minlength`/`maxlength`/`match`,
 * `min`/`max` và custom `validate`). Lỗi phát hiện sẽ được ghi vào `errorsMap`.
 * @param {*} value - Giá trị cần kiểm tra.
 * @param {Object} spec - Đặc tả trường Schema.
 * @param {Object} docContext - Ngữ cảnh `this` (document hoặc subdocument) truyền cho rule dạng hàm.
 * @param {string} path - Đường dẫn trường phục vụ đánh dấu lỗi trong `errorsMap`.
 * @param {Object<string, {message: string}>} errorsMap - Đối tượng gom lỗi validation.
 * @returns {void}
 */
function validateValueAgainstSpec(value, spec, docContext, path, errorsMap) {
  // Kiểm tra điều kiện bắt buộc (hỗ trợ required dạng boolean hoặc hàm phụ thuộc ngữ cảnh document)
  if (spec.required !== undefined) {
    const [reqSpec, reqMsg] = extractTupleOption(
      spec.required,
      `${path} là bắt buộc.`,
    );
    const isRequired =
      typeof reqSpec === "function" ? Boolean(reqSpec.call(docContext)) : Boolean(reqSpec);
    if (isRequired && (value === undefined || value === null || value === "")) {
      errorsMap[path] = { message: reqMsg };
      return;
    }
  }

  if (value === undefined || value === null) {
    return;
  }

  // Kiểm tra đệ quy các phần tử subdocument trong mảng và validator cấp mảng (nếu có)
  if (Array.isArray(spec.type)) {
    const subSchema = spec.type[0];
    if (Array.isArray(value) && subSchema instanceof Schema) {
      value.forEach((item, index) => {
        for (const [subKey, subSpec] of Object.entries(subSchema.fields)) {
          validateValueAgainstSpec(
            item?.[subKey],
            subSpec,
            item,
            `${path}.${index}.${subKey}`,
            errorsMap,
          );
        }
      });
    }
    if (spec.validate) {
      const validateFn =
        typeof spec.validate === "function"
          ? spec.validate
          : spec.validate.validator;
      const validateMsg = spec.validate?.message ?? `${path} không hợp lệ.`;
      if (validateFn && !validateFn.call(docContext, value)) {
        errorsMap[path] = { message: validateMsg };
        return;
      }
    }
    return;
  }

  // Kiểm tra đệ quy các trường con của object subdocument
  if (spec.type instanceof Schema) {
    for (const [subKey, subSpec] of Object.entries(spec.type.fields)) {
      validateValueAgainstSpec(
        value?.[subKey],
        subSpec,
        value,
        `${path}.${subKey}`,
        errorsMap,
      );
    }
    return;
  }

  if (spec.type === Date && !(value instanceof Date && !Number.isNaN(value.getTime()))) {
    errorsMap[path] = { message: `${path} không phải ngày hợp lệ.` };
    return;
  }

  if (spec.type === Number && (typeof value !== "number" || Number.isNaN(value))) {
    errorsMap[path] = { message: `${path} phải là số.` };
    return;
  }

  if (spec.enum !== undefined) {
    const enumValues = Array.isArray(spec.enum)
      ? spec.enum
      : spec.enum.values;
    const enumMsg = Array.isArray(spec.enum)
      ? `${path} không hợp lệ.`
      : (spec.enum.message ?? `${path} không hợp lệ.`);
    if (!enumValues.includes(value)) {
      errorsMap[path] = { message: enumMsg };
      return;
    }
  }

  // Kiểm tra các ràng buộc chuỗi: minlength, maxlength và biểu thức chính quy match
  if (typeof value === "string") {
    if (spec.minlength !== undefined) {
      const [minLen, msg] = extractTupleOption(
        spec.minlength,
        `${path} quá ngắn.`,
      );
      if (value.length < minLen) {
        errorsMap[path] = { message: msg };
        return;
      }
    }
    if (spec.maxlength !== undefined) {
      const [maxLen, msg] = extractTupleOption(
        spec.maxlength,
        `${path} quá dài.`,
      );
      if (value.length > maxLen) {
        errorsMap[path] = { message: msg };
        return;
      }
    }
    if (spec.match !== undefined) {
      const [regex, msg] = extractTupleOption(
        spec.match,
        `${path} không đúng định dạng.`,
      );
      if (!regex.test(value)) {
        errorsMap[path] = { message: msg };
        return;
      }
    }
  }

  // Kiểm tra các ràng buộc khoảng giá trị số: min và max
  if (typeof value === "number") {
    if (spec.min !== undefined) {
      const [minVal, msg] = extractTupleOption(spec.min, `${path} quá nhỏ.`);
      if (value < minVal) {
        errorsMap[path] = { message: msg };
        return;
      }
    }
    if (spec.max !== undefined) {
      const [maxVal, msg] = extractTupleOption(spec.max, `${path} quá lớn.`);
      if (value > maxVal) {
        errorsMap[path] = { message: msg };
        return;
      }
    }
  }

  if (spec.validate) {
    const validateFn =
      typeof spec.validate === "function"
        ? spec.validate
        : spec.validate.validator;
    const validateMsg = spec.validate?.message ?? `${path} không hợp lệ.`;
    if (validateFn && !validateFn.call(docContext, value)) {
      errorsMap[path] = { message: validateMsg };
    }
  }
}

/** Bản đồ đăng ký toàn bộ các `PgModel` theo `modelName` để hỗ trợ tính năng `populate()` tham chiếu chéo. */
const modelRegistry = new Map();

/**
 * Tìm tên Model đích được tham chiếu bởi `fieldPath` (hỗ trợ cả đường dẫn lồng như `"assignedUsers.user"`).
 * @param {Schema} schema - Schema nguồn bắt đầu tra cứu.
 * @param {string} fieldPath - Đường dẫn trường cần populate.
 * @returns {string|null} Tên Model tham chiếu (`spec.ref`) hoặc `null` nếu không phải trường tham chiếu.
 */
function getReferenceModelName(schema, fieldPath) {
  const parts = fieldPath.split(".");
  let currentSchema = schema;
  for (let i = 0; i < parts.length; i += 1) {
    const spec = currentSchema?.fields?.[parts[i]];
    if (!spec) return null;
    if (i === parts.length - 1) {
      return spec.ref ?? null;
    }
    if (Array.isArray(spec.type) && spec.type[0] instanceof Schema) {
      currentSchema = spec.type[0];
    } else if (spec.type instanceof Schema) {
      currentSchema = spec.type;
    } else {
      return null;
    }
  }
  return null;
}

/**
 * Thu thập toàn bộ các ID cần truy vấn cho một bước `populate` từ danh sách document nguồn (hỗ trợ mảng lồng nhau).
 * @param {Array<Object>} docs - Danh sách document nguồn.
 * @param {Array<string>} parts - Các phân đoạn của đường dẫn trường (tách theo dấu `.`).
 * @returns {Array<string>} Mảng các chuỗi ID tham chiếu tìm được.
 */
function getNestedIds(docs, parts) {
  const ids = [];
  function walk(node, index) {
    if (node === null || node === undefined) return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item, index);
      return;
    }
    if (index === parts.length - 1) {
      const val = node[parts[index]];
      if (typeof val === "string" && val) {
        ids.push(val);
      } else if (val && typeof val === "object" && val._id) {
        ids.push(String(val._id));
      }
      return;
    }
    walk(node[parts[index]], index + 1);
  }
  for (const doc of docs) {
    walk(doc, 0);
  }
  return ids;
}

/**
 * Thay thế các ID tham chiếu trong danh sách document nguồn bằng object đã truy vấn từ `lookupMap`.
 * @param {Array<Object>} docs - Danh sách document nguồn cần gán dữ liệu populate.
 * @param {Array<string>} parts - Các phân đoạn của đường dẫn trường.
 * @param {Map<string, Object>} lookupMap - Bản đồ ánh xạ `id -> bản ghi đích`.
 * @returns {void}
 */
function setNestedPopulated(docs, parts, lookupMap) {
  function walk(node, index) {
    if (node === null || node === undefined) return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item, index);
      return;
    }
    if (index === parts.length - 1) {
      const key = parts[index];
      const rawVal = node[key];
      if (!rawVal) {
        node[key] = null;
        return;
      }
      const idStr = typeof rawVal === "object" && rawVal._id ? String(rawVal._id) : String(rawVal);
      node[key] = lookupMap.get(idStr) ?? null;
      return;
    }
    walk(node[parts[index]], index + 1);
  }
  for (const doc of docs) {
    walk(doc, 0);
  }
}

/**
 * Thực thi các chỉ thị `populate` cho một tập document bằng truy vấn lô (`$in`) nhằm tránh N+1 query.
 * @param {Array<Object>} docs - Mảng document hoặc plain object cần populate.
 * @param {Schema} sourceSchema - Schema của collection nguồn.
 * @param {Array<{path: string, select: string|null}>} populateList - Danh sách trường cần nối dữ liệu.
 * @returns {Promise<Array<Object>>} Chính mảng `docs` sau khi đã gán dữ liệu populate.
 */
async function applyPopulates(docs, sourceSchema, populateList) {
  if (!docs.length || !populateList.length) return docs;

  for (const pop of populateList) {
    const refModelName = getReferenceModelName(sourceSchema, pop.path);
    if (!refModelName) continue;
    const TargetModel = modelRegistry.get(refModelName);
    if (!TargetModel) continue;

    const parts = pop.path.split(".");
    // Gom toàn bộ ID duy nhất để chỉ thực hiện 1 câu truy vấn WHERE id = ANY(...) cho mỗi path
    const rawIds = [...new Set(getNestedIds(docs, parts))];
    if (!rawIds.length) {
      setNestedPopulated(docs, parts, new Map());
      continue;
    }

    const query = TargetModel.find({ _id: { $in: rawIds } });
    if (pop.select) {
      query.select(pop.select);
    }
    const fetched = await query.lean();
    const lookupMap = new Map(fetched.map((item) => [String(item._id), item]));
    setNestedPopulated(docs, parts, lookupMap);
  }

  return docs;
}

/**
 * Chuẩn hóa đối số truyền vào `.populate(...)` (hỗ trợ string, pair `(path, select)`, object `{ path, select }` hoặc mảng).
 * @param {string|Object|Array} arg1 - Đường dẫn hoặc cấu hình populate.
 * @param {string} [arg2] - Chuỗi trường cần chọn khi `arg1` là string.
 * @returns {Array<{path: string, select: string|null}>} Danh sách cấu hình populate chuẩn hóa.
 */
function normalizePopulateArgs(arg1, arg2) {
  if (!arg1) return [];
  if (Array.isArray(arg1)) {
    return arg1.flatMap((item) => normalizePopulateArgs(item));
  }
  if (typeof arg1 === "string") {
    return [{ path: arg1, select: typeof arg2 === "string" ? arg2 : null }];
  }
  if (typeof arg1 === "object" && arg1.path) {
    return [{ path: arg1.path, select: arg1.select ?? null }];
  }
  return [];
}

/**
 * Phân tích chuỗi `.select(...)` theo cú pháp Mongoose (`"a b"`, `"-password"`, `"+tokenVersion"`, `"sub.field"`)
 * để xác định tập các trường cấp cao nhất và trường con được phép trả về.
 * @param {Schema} schema - Schema của Model hiện tại.
 * @param {string|null} selectStr - Chuỗi chỉ định trường cần lấy hoặc loại trừ.
 * @returns {{visibleFields: Set<string>, subFieldSelections: Map<string, Set<string>>}} Đặc tả lọc trường.
 */
function parseSelectSpec(schema, selectStr) {
  const allFields = ["_id", ...Object.keys(schema.fields)];
  // Mặc định ẩn các trường có cấu hình `select: false` (như password, tokenVersion)
  const defaultVisible = allFields.filter(
    (field) => schema.fields[field]?.select !== false,
  );

  if (!selectStr || typeof selectStr !== "string") {
    return {
      visibleFields: new Set(defaultVisible),
      subFieldSelections: new Map(),
    };
  }

  const tokens = selectStr.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) {
    return {
      visibleFields: new Set(defaultVisible),
      subFieldSelections: new Map(),
    };
  }

  const hasInclude = tokens.some((t) => !t.startsWith("-") && !t.startsWith("+"));
  const hasPlus = tokens.some((t) => t.startsWith("+"));
  const hasMinus = tokens.some((t) => t.startsWith("-"));

  let visibleFields;
  // Nếu chỉ định danh sách trường lấy tường minh (không có + / -), chỉ giữ _id và các trường đó
  if (hasInclude && !hasPlus && !hasMinus) {
    visibleFields = new Set(["_id"]);
  } else {
    visibleFields = new Set(defaultVisible);
  }

  const subFieldSelections = new Map();

  for (const token of tokens) {
    if (token.startsWith("-")) {
      const field = token.slice(1);
      visibleFields.delete(field);
    } else if (token.startsWith("+")) {
      const field = token.slice(1);
      visibleFields.add(field);
    } else if (token.includes(".")) {
      const [parent, ...rest] = token.split(".");
      visibleFields.add(parent);
      if (!subFieldSelections.has(parent)) {
        subFieldSelections.set(parent, new Set(["_id"]));
      }
      subFieldSelections.get(parent).add(rest.join("."));
    } else {
      visibleFields.add(token);
    }
  }

  return { visibleFields, subFieldSelections };
}

/**
 * Lọc các trường của một bản ghi thô dựa trên kết quả từ `parseSelectSpec`.
 * @param {Object} rawObj - Dữ liệu bản ghi đầy đủ đã ánh xạ từ PostgreSQL row.
 * @param {{visibleFields: Set<string>, subFieldSelections: Map<string, Set<string>>}} selectSpec - Đặc tả lọc trường.
 * @returns {Object} Bản ghi chỉ gồm các trường được phép hiển thị.
 */
function projectRowFields(rawObj, selectSpec) {
  const { visibleFields, subFieldSelections } = selectSpec;
  const result = {};

  for (const [key, value] of Object.entries(rawObj)) {
    if (!visibleFields.has(key)) continue;

    if (subFieldSelections.has(key) && Array.isArray(value)) {
      const allowedSub = subFieldSelections.get(key);
      result[key] = value.map((item) => {
        if (!item || typeof item !== "object") return item;
        const projectedItem = {};
        for (const [subKey, subVal] of Object.entries(item)) {
          if (allowedSub.has(subKey)) {
            projectedItem[subKey] = subVal;
          }
        }
        return projectedItem;
      });
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Sao chép sâu giá trị thuần (Date, Array, Plain Object) để tách biệt snapshot đã lưu với bản đang chỉnh sửa.
 * @param {*} val - Giá trị cần sao chép.
 * @returns {*} Bản sao độc lập của giá trị đầu vào.
 */
function clonePlainValue(val) {
  if (val instanceof Date) return new Date(val.getTime());
  if (Array.isArray(val)) return val.map(clonePlainValue);
  if (val && typeof val === "object") {
    const out = {};
    for (const [k, v] of Object.entries(val)) {
      out[k] = clonePlainValue(v);
    }
    return out;
  }
  return val;
}

/**
 * Biên dịch đối tượng filter kiểu Mongoose/MongoDB thành mệnh đề `WHERE` tham số hóa của PostgreSQL.
 * Hỗ trợ: `$or`, `$and`, `$expr.$gte`, truy vấn mảng JSONB (`jsonb_array_elements`), đường dẫn JSONB lồng (`->>`),
 * `RegExp` (`~` / `~*`), `$ne`, `$in`, `$nin`, `$gte`, `$gt`, `$lte`, `$lt`, `$regex`, `$type`, `null`.
 * @param {Object} filter - Bộ lọc truy vấn kiểu Mongoose.
 * @param {Schema} schema - Schema dùng để nhận diện cột JSONB hay cột thường.
 * @param {number} [startIndex=1] - Chỉ số bắt đầu cho placeholder `$1, $2, ...` của PostgreSQL.
 * @returns {{clause: string, params: Array<*>}} Mệnh đề SQL `WHERE` và mảng tham số tương ứng.
 */
function compileWhereClause(filter, schema, startIndex = 1) {
  const params = [];

  function pushParam(val) {
    params.push(val);
    return `$${startIndex + params.length - 1}`;
  }

  // Tạo biểu thức truy cập cột thường hoặc khóa JSONB lồng nhau (ví dụ: lastHost.hostname -> "last_host"->>'hostname')
  function buildColumnExpr(fieldPath) {
    if (fieldPath.includes(".")) {
      const [root, ...rest] = fieldPath.split(".");
      const rootCol = `"${toSnakeCase(root)}"`;
      if (rest.length === 1) {
        return `(${rootCol}->>'${rest[0]}')`;
      }
      const pathChain = rest
        .slice(0, -1)
        .map((p) => `'${p}'`)
        .join("->");
      return `(${rootCol}->${pathChain}->>'${rest[rest.length - 1]}')`;
    }
    return `"${toSnakeCase(fieldPath)}"`;
  }

  function compileCondition(node) {
    if (!node || typeof node !== "object") {
      return "TRUE";
    }

    const parts = [];

    for (const [key, condition] of Object.entries(node)) {
      if (key === "$or") {
        if (!Array.isArray(condition) || condition.length === 0) {
          parts.push("FALSE");
        } else {
          const branches = condition.map((sub) => `(${compileCondition(sub)})`);
          parts.push(`(${branches.join(" OR ")})`);
        }
        continue;
      }

      if (key === "$and") {
        if (!Array.isArray(condition) || condition.length === 0) {
          parts.push("TRUE");
        } else {
          const branches = condition.map((sub) => `(${compileCondition(sub)})`);
          parts.push(`(${branches.join(" AND ")})`);
        }
        continue;
      }

      if (key === "$expr") {
        if (condition?.$gte && Array.isArray(condition.$gte)) {
          const [left, right] = condition.$gte;
          const leftExpr =
            typeof left === "string" && left.startsWith("$")
              ? buildColumnExpr(left.slice(1))
              : pushParam(left);
          const rightExpr =
            typeof right === "string" && right.startsWith("$")
              ? buildColumnExpr(right.slice(1))
              : pushParam(right);
          parts.push(`${leftExpr} >= ${rightExpr}`);
        }
        continue;
      }

      // Check JSONB array dot-path like "assignedUsers.user"
      // Nếu trường gốc là mảng JSONB, dùng EXISTS + jsonb_array_elements để tìm phần tử khớp điều kiện
      if (key.includes(".")) {
        const [rootField, ...nested] = key.split(".");
        const rootSpec = schema.fields[rootField];
        if (rootSpec && Array.isArray(rootSpec.type)) {
          const subField = nested[0];
          const rootCol = `"${toSnakeCase(rootField)}"`;
          if (condition instanceof RegExp) {
            const op = condition.flags.includes("i") ? "~*" : "~";
            const p = pushParam(condition.source);
            parts.push(
              `EXISTS (SELECT 1 FROM jsonb_array_elements(${rootCol}) AS elem WHERE elem->>'${subField}' ${op} ${p})`,
            );
          } else {
            const val =
              condition && typeof condition === "object" && "_id" in condition
                ? String(condition._id)
                : String(condition);
            const p = pushParam(val);
            parts.push(
              `EXISTS (SELECT 1 FROM jsonb_array_elements(${rootCol}) AS elem WHERE elem->>'${subField}' = ${p})`,
            );
          }
          continue;
        }
      }

      const colExpr = buildColumnExpr(key);

      if (condition instanceof RegExp) {
        const op = condition.flags.includes("i") ? "~*" : "~";
        const p = pushParam(condition.source);
        parts.push(`${colExpr} ${op} ${p}`);
        continue;
      }

      // Biên dịch các toán tử so sánh MongoDB ($ne, $in, $nin, $gte, $gt, $lte, $lt, $regex, $type) sang SQL
      if (
        condition !== null &&
        typeof condition === "object" &&
        !Array.isArray(condition) &&
        !(condition instanceof Date) &&
        !("_id" in condition)
      ) {
        const opKeys = Object.keys(condition);
        if (opKeys.some((k) => k.startsWith("$"))) {
          if ("$ne" in condition) {
            if (condition.$ne === null) {
              parts.push(`${colExpr} IS NOT NULL`);
            } else {
              parts.push(`${colExpr} IS DISTINCT FROM ${pushParam(condition.$ne)}`);
            }
          }
          if ("$in" in condition) {
            const list = condition.$in ?? [];
            if (list.length === 0) {
              parts.push("FALSE");
            } else {
              const normalizedList = list.map((item) =>
                item && typeof item === "object" && "_id" in item
                  ? String(item._id)
                  : item,
              );
              parts.push(`${colExpr} = ANY(${pushParam(normalizedList)})`);
            }
          }
          if ("$nin" in condition) {
            const list = condition.$nin ?? [];
            if (list.length === 0) {
              parts.push("TRUE");
            } else {
              const normalizedList = list.map((item) =>
                item && typeof item === "object" && "_id" in item
                  ? String(item._id)
                  : item,
              );
              parts.push(`NOT (${colExpr} = ANY(${pushParam(normalizedList)}))`);
            }
          }
          if ("$gte" in condition) {
            parts.push(`${colExpr} >= ${pushParam(condition.$gte)}`);
          }
          if ("$gt" in condition) {
            parts.push(`${colExpr} > ${pushParam(condition.$gt)}`);
          }
          if ("$lte" in condition) {
            parts.push(`${colExpr} <= ${pushParam(condition.$lte)}`);
          }
          if ("$lt" in condition) {
            parts.push(`${colExpr} < ${pushParam(condition.$lt)}`);
          }
          if ("$regex" in condition) {
            const pattern =
              condition.$regex instanceof RegExp
                ? condition.$regex.source
                : String(condition.$regex);
            const caseInsensitive =
              typeof condition.$options === "string" &&
              condition.$options.includes("i");
            const op = caseInsensitive ? "~*" : "~";
            parts.push(`${colExpr} ${op} ${pushParam(pattern)}`);
          }
          if ("$type" in condition) {
            if (condition.$type === "date") {
              parts.push(`${colExpr} IS NOT NULL`);
            }
          }
          continue;
        }
      }

      if (condition === null) {
        parts.push(`${colExpr} IS NULL`);
      } else {
        const val =
          condition && typeof condition === "object" && "_id" in condition
            ? String(condition._id)
            : condition;
        parts.push(`${colExpr} = ${pushParam(val)}`);
      }
    }

    return parts.length ? parts.join(" AND ") : "TRUE";
  }

  const clause = compileCondition(filter);
  return { clause, params };
}

/**
 * Biên dịch đối tượng `.sort({ field: -1 | 1 | "desc" | "asc" })` thành mệnh đề `ORDER BY` của PostgreSQL.
 * Sử dụng `DESC NULLS LAST` cho sắp xếp giảm dần để tương thích hành vi xếp giá trị null của MongoDB.
 * @param {Object|null} sortObj - Đối tượng cấu hình sắp xếp.
 * @returns {string} Chuỗi `ORDER BY ...` hoặc chuỗi rỗng nếu không có cấu hình sort.
 */
function compileSortClause(sortObj) {
  if (!sortObj || typeof sortObj !== "object") return "";
  const entries = Object.entries(sortObj);
  if (!entries.length) return "";
  const orders = entries.map(([field, dir]) => {
    const col = `"${toSnakeCase(field)}"`;
    const isDesc = dir === -1 || dir === "desc";
    return isDesc ? `${col} DESC NULLS LAST` : `${col} ASC`;
  });
  return `ORDER BY ${orders.join(", ")}`;
}

/**
 * Ánh xạ một hàng dữ liệu snake_case trả về từ PostgreSQL (`row`) sang object camelCase theo `schema`,
 * đồng thời chuyển đổi `id -> _id` và khôi phục các trường chuỗi ISO ngày tháng bên trong JSONB về đối tượng `Date`.
 * @param {Object} row - Bản ghi thô từ `pg` query result.
 * @param {Schema} schema - Schema mô tả kiểu dữ liệu từng trường.
 * @returns {Object} Object JavaScript thuần đã chuẩn hóa kiểu dữ liệu.
 */
function rowToRawObject(row, schema) {
  const obj = { _id: row.id };
  for (const [key, spec] of Object.entries(schema.fields)) {
    if (key === "_id") continue;
    const col = toSnakeCase(key);
    if (!(col in row)) continue;
    let val = row[col];
    if (val instanceof Date) {
      val = new Date(val.getTime());
    } else if (spec.type === Date && typeof val === "string") {
      val = new Date(val);
    } else if (Array.isArray(spec.type) && Array.isArray(val)) {
      const subSchema = spec.type[0];
      if (subSchema instanceof Schema) {
        val = val.map((item) => {
          const cloned = { ...item };
          for (const [subKey, subSpec] of Object.entries(subSchema.fields)) {
            if (subSpec.type === Date && typeof cloned[subKey] === "string") {
              cloned[subKey] = new Date(cloned[subKey]);
            }
          }
          return cloned;
        });
      }
    } else if (spec.type instanceof Schema && val && typeof val === "object") {
      const cloned = { ...val };
      for (const [subKey, subSpec] of Object.entries(spec.type.fields)) {
        if (subSpec.type === Date && typeof cloned[subKey] === "string") {
          cloned[subKey] = new Date(cloned[subKey]);
        }
      }
      val = cloned;
    }
    obj[key] = val;
  }
  return obj;
}

/**
 * Khởi tạo bộ đánh giá Aggregation Pipeline chạy trên tập bản ghi đã tải từ PostgreSQL.
 * Hỗ trợ các stage: `$match`, `$group` (`$sum`, `$avg`), `$project`, `$sort`, `$facet`
 * cùng các biểu thức `$eq`, `$in`, `$cond`, `$subtract`, `$dateToString`.
 * @returns {(initialRows: Array<Object>, pipeline: Array<Object>) => Array<Object>} Hàm `runPipeline`.
 */
function createAggregateEvaluator() {
  const dateFormatters = new Map();

  /**
   * Định dạng giá trị ngày theo múi giờ chỉ định (cache `Intl.DateTimeFormat` theo từng `timeZone` để tối ưu hiệu năng).
   * @param {Date|string|number} dateVal - Giá trị thời gian nguồn.
   * @param {string} format - Chuỗi định dạng (hỗ trợ `"%Y-%m-%d"`, mặc định trả về ISO string).
   * @param {string} [timeZone="UTC"] - Múi giờ IANA (ví dụ: `"Asia/Ho_Chi_Minh"`).
   * @returns {string|null} Chuỗi ngày đã định dạng hoặc `null` nếu ngày không hợp lệ.
   */
  function formatDateInZone(dateVal, format, timeZone = "UTC") {
    const d = dateVal instanceof Date ? dateVal : new Date(dateVal);
    if (Number.isNaN(d.getTime())) return null;
    const cacheKey = timeZone;
    let formatter = dateFormatters.get(cacheKey);
    if (!formatter) {
      formatter = new Intl.DateTimeFormat("en-US", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
      dateFormatters.set(cacheKey, formatter);
    }
    const parts = Object.fromEntries(
      formatter
        .formatToParts(d)
        .filter((p) => p.type !== "literal")
        .map((p) => [p.type, p.value]),
    );
    if (format === "%Y-%m-%d") {
      return `${parts.year}-${parts.month}-${parts.day}`;
    }
    return d.toISOString();
  }

  /**
   * Đánh giá một biểu thức Aggregation (`$field`, `$eq`, `$in`, `$cond`, `$subtract`, `$dateToString`) trên một document.
   * @param {*} expr - Biểu thức hoặc giá trị hằng.
   * @param {Object} doc - Document hiện tại đang xét.
   * @returns {*} Kết quả sau khi tính toán biểu thức.
   */
  function evalExpr(expr, doc) {
    if (expr === null || expr === undefined) return expr;
    if (typeof expr === "string") {
      if (expr.startsWith("$")) {
        return doc[expr.slice(1)];
      }
      return expr;
    }
    if (typeof expr !== "object" || expr instanceof Date) {
      return expr;
    }
    if ("$eq" in expr) {
      const [a, b] = expr.$eq;
      return evalExpr(a, doc) === evalExpr(b, doc);
    }
    if ("$in" in expr) {
      const [itemExpr, arrExpr] = expr.$in;
      const item = evalExpr(itemExpr, doc);
      const arr = evalExpr(arrExpr, doc);
      return Array.isArray(arr) && arr.includes(item);
    }
    if ("$cond" in expr) {
      const [cond, whenTrue, whenFalse] = expr.$cond;
      return evalExpr(cond, doc)
        ? evalExpr(whenTrue, doc)
        : evalExpr(whenFalse, doc);
    }
    if ("$subtract" in expr) {
      const [aExpr, bExpr] = expr.$subtract;
      const a = evalExpr(aExpr, doc);
      const b = evalExpr(bExpr, doc);
      const aNum = a instanceof Date ? a.getTime() : Number(a);
      const bNum = b instanceof Date ? b.getTime() : Number(b);
      return aNum - bNum;
    }
    if ("$dateToString" in expr) {
      const { date, format, timezone } = expr.$dateToString;
      return formatDateInZone(evalExpr(date, doc), format, timezone);
    }
    return expr;
  }

  /**
   * Kiểm tra một document có thỏa mãn điều kiện trong stage `$match` hay không (dùng cho các `$match` nằm sau stage khác).
   * @param {Object} doc - Document hiện tại.
   * @param {Object} filter - Bộ lọc điều kiện `$match`.
   * @returns {boolean} `true` nếu khớp điều kiện.
   */
  function matchDoc(doc, filter) {
    for (const [key, cond] of Object.entries(filter ?? {})) {
      if (key === "$expr") {
        if (cond?.$gte) {
          const [a, b] = cond.$gte;
          const av = evalExpr(a, doc);
          const bv = evalExpr(b, doc);
          const aNum = av instanceof Date ? av.getTime() : av;
          const bNum = bv instanceof Date ? bv.getTime() : bv;
          if (!(aNum >= bNum)) return false;
        }
        continue;
      }
      const val = doc[key];
      if (
        cond !== null &&
        typeof cond === "object" &&
        !Array.isArray(cond) &&
        !(cond instanceof Date)
      ) {
        if ("$ne" in cond && val === cond.$ne) return false;
        if ("$in" in cond && !(cond.$in ?? []).includes(val)) return false;
        if ("$nin" in cond && (cond.$nin ?? []).includes(val)) return false;
        if ("$gte" in cond && !(val >= cond.$gte)) return false;
        if ("$lt" in cond && !(val < cond.$lt)) return false;
        if ("$type" in cond && cond.$type === "date" && !(val instanceof Date)) {
          return false;
        }
      } else if (val !== cond) {
        return false;
      }
    }
    return true;
  }

  /**
   * Thực thi một stage đơn lẻ (`$match`, `$group`, `$project`, `$sort`, `$facet`) trên tập bản ghi `rows`.
   * @param {Array<Object>} rows - Tập dữ liệu đầu vào của stage.
   * @param {Object} stage - Định nghĩa stage.
   * @returns {Array<Object>} Tập dữ liệu đầu ra sau stage.
   */
  function runStage(rows, stage) {
    if ("$match" in stage) {
      return rows.filter((row) => matchDoc(row, stage.$match));
    }

    if ("$group" in stage) {
      const groupSpec = stage.$group;
      const groups = new Map();

      // Gom nhóm bản ghi theo khóa _id tính từ biểu thức groupSpec._id
      for (const row of rows) {
        const rawKey = evalExpr(groupSpec._id, row);
        const mapKey =
          rawKey === null || rawKey === undefined
            ? "__null__"
            : String(rawKey);
        if (!groups.has(mapKey)) {
          groups.set(mapKey, { keyVal: rawKey ?? null, items: [] });
        }
        groups.get(mapKey).items.push(row);
      }

      const out = [];
      for (const { keyVal, items } of groups.values()) {
        const record = { _id: keyVal };
        for (const [field, accum] of Object.entries(groupSpec)) {
          if (field === "_id") continue;
          if ("$sum" in accum) {
            let total = 0;
            for (const item of items) {
              const v = evalExpr(accum.$sum, item);
              total += Number(v ?? 0);
            }
            record[field] = total;
          } else if ("$avg" in accum) {
            let total = 0;
            let count = 0;
            for (const item of items) {
              const v = evalExpr(accum.$avg, item);
              if (typeof v === "number" && Number.isFinite(v)) {
                total += v;
                count += 1;
              }
            }
            record[field] = count > 0 ? total / count : null;
          }
        }
        out.push(record);
      }
      return out;
    }

    if ("$project" in stage) {
      return rows.map((row) => {
        const projected = { ...row };
        for (const [k, v] of Object.entries(stage.$project)) {
          if (v === 0) {
            delete projected[k];
          }
        }
        return projected;
      });
    }

    if ("$sort" in stage) {
      const entries = Object.entries(stage.$sort);
      return [...rows].sort((a, b) => {
        for (const [field, dir] of entries) {
          if (a[field] === b[field]) continue;
          if (a[field] == null) return dir === -1 ? 1 : -1;
          if (b[field] == null) return dir === -1 ? -1 : 1;
          if (a[field] < b[field]) return dir === -1 ? 1 : -1;
          return dir === -1 ? -1 : 1;
        }
        return 0;
      });
    }

    if ("$facet" in stage) {
      const facetResult = {};
      for (const [facetName, subPipeline] of Object.entries(stage.$facet)) {
        facetResult[facetName] = runPipeline(rows, subPipeline);
      }
      return [facetResult];
    }

    return rows;
  }

  /**
   * Chạy tuần tự toàn bộ danh sách các stage trong `pipeline` từ dữ liệu ban đầu `initialRows`.
   * @param {Array<Object>} initialRows - Danh sách bản ghi ban đầu.
   * @param {Array<Object>} pipeline - Chuỗi các stage aggregation.
   * @returns {Array<Object>} Kết quả cuối cùng của pipeline.
   */
  function runPipeline(initialRows, pipeline) {
    let current = initialRows;
    for (const stage of pipeline) {
      current = runStage(current, stage);
    }
    return current;
  }

  return runPipeline;
}

/** Hàm thực thi Aggregation Pipeline được khởi tạo sẵn từ `createAggregateEvaluator()`. */
const runAggregatePipeline = createAggregateEvaluator();

/**
 * Khởi tạo lớp Model (`PgModel`) và Document (`PgDocument`) gắn với một bảng PostgreSQL,
 * cung cấp giao diện truy vấn và lưu trữ tương thích Mongoose (`create`, `find`, `findOne`, `save`, `aggregate`...).
 * @param {string} modelName - Tên Model (ví dụ: `"Ticket"`, `"User"`).
 * @param {Schema} schema - Đối tượng `Schema` định nghĩa trường, hook và phương thức.
 * @param {string|null} [explicitTableName=null] - Tên bảng PostgreSQL tường minh (nếu khác tên mặc định).
 * @returns {typeof PgModel} Lớp Model đã được đăng ký vào `modelRegistry`.
 */
export function createModel(modelName, schema, explicitTableName = null) {
  const tableName =
    explicitTableName || schema.options?.collection || defaultTableName(modelName);
  const schemaFields = schema.fields;
  const allFieldKeys = ["_id", ...Object.keys(schemaFields).filter((k) => k !== "_id")];

  /**
   * Đại diện cho một bản ghi (document) của bảng `tableName`, theo dõi trạng thái mới/cũ (`_isNew`),
   * các trường đã chỉnh sửa (`_modifiedFields`), snapshot đã lưu (`_persistedSnapshot`) và hỗ trợ `validate()`, `save()`, `populate()`.
   */
  class PgDocument {
    /**
     * Khởi tạo một instance document mới hoặc dựng lại (hydrate) từ bản ghi PostgreSQL.
     * @param {Object} [initialData={}] - Dữ liệu ban đầu của document.
     * @param {{isNew?: boolean, fromDb?: boolean, allowedFields?: Set<string>|null}} [options={}] - Cờ trạng thái nguồn dữ liệu.
     */
    constructor(initialData = {}, options = {}) {
      const isNew = options.isNew ?? true;
      const fromDb = options.fromDb ?? false;
      const allowedFields = options.allowedFields ?? null;

      // Lưu các metadata nội bộ dạng non-enumerable để tránh xuất hiện khi JSON.stringify / Object.keys
      Object.defineProperty(this, "_isNew", {
        value: isNew,
        writable: true,
        enumerable: false,
      });
      Object.defineProperty(this, "_data", {
        value: {},
        writable: true,
        enumerable: false,
      });
      Object.defineProperty(this, "_modifiedFields", {
        value: new Set(),
        writable: true,
        enumerable: false,
      });
      Object.defineProperty(this, "_persistedSnapshot", {
        value: {},
        writable: true,
        enumerable: false,
      });
      Object.defineProperty(this, "_loadedFields", {
        value: new Set(allowedFields ?? allFieldKeys),
        writable: true,
        enumerable: false,
      });

      const keysToInit = allowedFields
        ? allFieldKeys.filter((k) => allowedFields.has(k))
        : allFieldKeys;

      // Định nghĩa getter/setter cho từng trường nhằm tự động ép kiểu và đánh dấu _modifiedFields khi thay đổi
      for (const key of allFieldKeys) {
        Object.defineProperty(this, key, {
          enumerable: keysToInit.includes(key),
          configurable: true,
          get() {
            return this._data[key];
          },
          set(nextValue) {
            const spec = schemaFields[key];
            const coerced = spec ? coerceValue(nextValue, spec, key) : nextValue;
            this._data[key] = coerced;
            this._modifiedFields.add(key);
          },
        });
      }

      if (fromDb) {
        // Khi tải từ DB, sao chép nguyên giá trị và lưu snapshot để đối chiếu optimistic concurrency (__v)
        for (const key of keysToInit) {
          this._data[key] = initialData[key];
          this._persistedSnapshot[key] = clonePlainValue(initialData[key]);
        }
      } else {
        // Khi tạo document mới trong bộ nhớ, tự sinh _id, timestamps và áp dụng giá trị mặc định
        const now = new Date();
        if (!("_id" in schemaFields)) {
          this._data._id =
            initialData._id !== undefined ? String(initialData._id) : generateId();
        }
        for (const key of Object.keys(schemaFields)) {
          const spec = schemaFields[key];
          let rawVal = initialData[key];
          if (key === "_id") {
            this._data._id = rawVal !== undefined ? String(rawVal) : generateId();
            this._modifiedFields.add("_id");
            continue;
          }
          if (schema.options.timestamps && (key === "createdAt" || key === "updatedAt")) {
            rawVal = rawVal !== undefined ? rawVal : now;
          } else if (rawVal === undefined) {
            rawVal = resolveDefault(spec);
          }
          if (rawVal !== undefined) {
            this._data[key] = coerceValue(rawVal, spec, key);
            if (initialData[key] !== undefined || spec.default !== undefined) {
              this._modifiedFields.add(key);
            }
          }
        }
      }
    }

    /**
     * Kiểm tra xem một trường đã bị thay đổi giá trị kể từ khi tạo hoặc tải từ DB hay chưa.
     * Hữu ích trong `pre("save")` hook (ví dụ: chỉ bcrypt hash lại mật khẩu khi `isModified("password")`).
     * @param {string} fieldName - Tên trường cần kiểm tra.
     * @returns {boolean} `true` nếu trường có dữ liệu mới hoặc đã được gán lại.
     */
    isModified(fieldName) {
      if (this._isNew) {
        return this._data[fieldName] !== undefined;
      }
      return this._modifiedFields.has(fieldName);
    }

    /**
     * Chuẩn hóa lại toàn bộ các trường JSONB (mảng / subdocument) trước khi validate hoặc lưu DB,
     * đảm bảo các phần tử thêm bằng `.push(...)` vẫn được sinh `_id` và ép kiểu đúng.
     * @returns {void}
     */
    _normalizeJsonFields() {
      for (const [key, spec] of Object.entries(schemaFields)) {
        if (isJsonField(spec) && this._data[key] !== undefined) {
          this._data[key] = coerceValue(this._data[key], spec, key);
        }
      }
    }

    /**
     * Thực thi kiểm tra hợp lệ toàn bộ các trường đã nạp hoặc vừa sửa đổi dựa trên rule trong Schema.
     * @throws {Error} Ném `ValidationError` nếu có ít nhất một trường không hợp lệ.
     * @returns {Promise<void>}
     */
    async validate() {
      this._normalizeJsonFields();
      const errorsMap = {};
      for (const [key, spec] of Object.entries(schemaFields)) {
        // Bỏ qua các trường không được select khi fetch và cũng không bị chỉnh sửa
        if (
          !this._isNew &&
          !this._loadedFields.has(key) &&
          !this._modifiedFields.has(key)
        ) {
          continue;
        }
        validateValueAgainstSpec(
          this._data[key],
          spec,
          this,
          key,
          errorsMap,
        );
      }
      if (Object.keys(errorsMap).length > 0) {
        throw createValidationError(errorsMap);
      }
    }

    /**
     * Lưu document xuống PostgreSQL (`INSERT` nếu mới hoặc `UPDATE` nếu đã tồn tại).
     * Luồng xử lý:
     * 1. Chuẩn hóa trường JSONB và chạy `validate()` (trừ khi `validateBeforeSave: false`).
     * 2. Chạy tuần tự các hook `pre("save")`.
     * 3. Tự động cập nhật `createdAt`/`updatedAt` nếu bật `timestamps`.
     * 4. Nếu `_isNew`, thực hiện `INSERT INTO ... RETURNING *` và chuyển `_isNew = false`.
     * 5. Nếu đã tồn tại, thực hiện `UPDATE ... WHERE id = ...` (kèm kiểm tra `version` nếu bật
     *    `optimisticConcurrency`, ném `VersionError` khi phát hiện xung đột ghi đồng thời).
     * @param {{validateBeforeSave?: boolean}} [options={}] - Tùy chọn lưu bản ghi.
     * @returns {Promise<PgDocument>} Chính instance document sau khi đồng bộ dữ liệu mới nhất từ DB.
     */
    async save(options = {}) {
      this._normalizeJsonFields();
      if (options.validateBeforeSave !== false) {
        await this.validate();
      }

      for (const hook of schema.preHooks.save) {
        await hook.call(this);
      }

      const now = new Date();
      if (schema.options.timestamps) {
        if (this._isNew && !this._data.createdAt) {
          this._data.createdAt = now;
        }
        if (this._isNew) {
          this._data.updatedAt = this._data.updatedAt ?? now;
        } else {
          this._data.updatedAt = now;
        }
      }

      const activePool = getPool();

      if (this._isNew) {
        const cols = [];
        const placeholders = [];
        const values = [];

        for (const key of allFieldKeys) {
          const val = this._data[key];
          if (val === undefined) continue;
          const spec = schemaFields[key];
          const colName = `"${toSnakeCase(key)}"`;
          cols.push(colName);
          placeholders.push(`$${values.length + 1}`);
          if (spec && isJsonField(spec)) {
            values.push(JSON.stringify(val));
          } else if (val && typeof val === "object" && !(val instanceof Date) && "_id" in val) {
            values.push(String(val._id));
          } else {
            values.push(val);
          }
        }

        const sql = `INSERT INTO ${tableName} (${cols.join(", ")}) VALUES (${placeholders.join(", ")}) RETURNING *`;
        try {
          const result = await activePool.query(sql, values);
          const fresh = rowToRawObject(result.rows[0], schema);
          for (const key of allFieldKeys) {
            if (key in fresh) {
              this._persistedSnapshot[key] = clonePlainValue(fresh[key]);
            }
          }
          this._isNew = false;
          this._modifiedFields.clear();
          return this;
        } catch (error) {
          throw mapPgError(error);
        }
      }

      // Existing record update
      const setClauses = [];
      const values = [];

      for (const key of allFieldKeys) {
        if (key === "_id" || key === "__v") continue;
        const spec = schemaFields[key];
        if (spec?.immutable) continue;
        if (!this._loadedFields.has(key) && !this._modifiedFields.has(key)) {
          continue;
        }
        const currentVal = this._data[key];
        if (currentVal === undefined) continue;

        const colName = `"${toSnakeCase(key)}"`;
        values.push(
          spec && isJsonField(spec)
            ? JSON.stringify(currentVal)
            : currentVal &&
                typeof currentVal === "object" &&
                !(currentVal instanceof Date) &&
                "_id" in currentVal
              ? String(currentVal._id)
              : currentVal,
        );
        setClauses.push(`${colName} = $${values.length}`);
      }

      // Tăng version khi bật Optimistic Concurrency Control để phát hiện xung đột cập nhật song song
      if (schema.options.optimisticConcurrency) {
        const nextVersion = Number(this._data.__v ?? 0) + 1;
        values.push(nextVersion);
        setClauses.push(`"version" = $${values.length}`);
      }

      values.push(this._data._id);
      let whereClause = `"id" = $${values.length}`;

      if (schema.options.optimisticConcurrency) {
        values.push(Number(this._persistedSnapshot.__v ?? this._data.__v ?? 0));
        whereClause += ` AND "version" = $${values.length}`;
      }

      const sql = `UPDATE ${tableName} SET ${setClauses.join(", ")} WHERE ${whereClause} RETURNING *`;
      try {
        const result = await activePool.query(sql, values);
        if (result.rowCount === 0 && schema.options.optimisticConcurrency) {
          const versionError = new Error(
            "Dữ liệu vừa được cập nhật. Vui lòng tải lại và thử lại.",
          );
          versionError.name = "VersionError";
          throw versionError;
        }
        if (result.rows[0]) {
          const fresh = rowToRawObject(result.rows[0], schema);
          for (const key of allFieldKeys) {
            if (key in fresh) {
              this._data[key] = fresh[key];
              this._persistedSnapshot[key] = clonePlainValue(fresh[key]);
            }
          }
        }
        this._modifiedFields.clear();
        return this;
      } catch (error) {
        throw mapPgError(error);
      }
    }

    /**
     * Nạp dữ liệu tham chiếu trực tiếp trên instance document hiện tại.
     * @param {string|Object|Array} arg1 - Tên trường hoặc cấu hình populate.
     * @param {string} [arg2] - Chuỗi select trường cần lấy từ bảng đích.
     * @returns {Promise<PgDocument>} Chính instance document sau khi đã populate.
     */
    async populate(arg1, arg2) {
      const populateList = normalizePopulateArgs(arg1, arg2);
      await applyPopulates([this._data], schema, populateList);
      return this;
    }

    /**
     * Xóa bản ghi tương ứng với document hiện tại khỏi PostgreSQL theo khóa chính `id`.
     * @returns {Promise<{deletedCount: number}>} Số lượng bản ghi đã xóa (0 hoặc 1).
     */
    async deleteOne() {
      const result = await getPool().query(
        `DELETE FROM ${tableName} WHERE "id" = $1`,
        [this._data._id],
      );
      return { deletedCount: result.rowCount ?? 0 };
    }

    /**
     * Chuyển document sang plain object chỉ chứa các trường enumerable và áp dụng hàm `transform` (nếu có).
     * @param {{transform?: Function}|undefined} transformOption - Cấu hình `toJSON` hoặc `toObject` của Schema.
     * @returns {Object} Plain object đại diện cho document.
     */
    _toPlain(transformOption) {
      const plain = {};
      for (const key of allFieldKeys) {
        const descriptor = Object.getOwnPropertyDescriptor(this, key);
        if (descriptor?.enumerable && this._data[key] !== undefined) {
          plain[key] = clonePlainValue(this._data[key]);
        }
      }
      if (transformOption?.transform) {
        return transformOption.transform(this, plain);
      }
      return plain;
    }

    /**
     * Chuyển đổi document sang Plain JS Object áp dụng cấu hình `schema.options.toObject`.
     * @returns {Object} Plain object.
     */
    toObject() {
      return this._toPlain(schema.options.toObject);
    }

    /**
     * Chuyển đổi document khi serialize JSON (ví dụ: `response.json(...)`) áp dụng `schema.options.toJSON`.
     * @returns {Object} Plain object đã lọc/biến đổi trường nhạy cảm (như ẩn password).
     */
    toJSON() {
      return this._toPlain(schema.options.toJSON);
    }
  }

  // Gắn các instance method tùy chỉnh từ schema.methods lên prototype của PgDocument
  for (const [methodName, fn] of Object.entries(schema.methods)) {
    PgDocument.prototype[methodName] = fn;
  }

  /**
   * Bộ dựng truy vấn nối chuỗi (Thenable Query Builder) mô phỏng `mongoose.Query`.
   * Hỗ trợ `.select()`, `.populate()`, `.sort()`, `.skip()`, `.limit()`, `.lean()` và `.exec()` / `await`.
   */
  class QueryBuilder {
    /**
     * Khởi tạo QueryBuilder cho một chế độ truy vấn cụ thể.
     * @param {"find"|"findOne"|"findOneAndUpdate"|"findByIdAndDelete"} mode - Loại thao tác truy vấn.
     * @param {Object} [filter={}] - Điều kiện lọc bản ghi.
     * @param {Object} [extra={}] - Tham số bổ sung (`update`, `options`) cho `findOneAndUpdate`.
     */
    constructor(mode, filter = {}, extra = {}) {
      this._mode = mode; // "find" | "findOne" | "findOneAndUpdate" | "findByIdAndDelete"
      this._filter = filter;
      this._extra = extra;
      this._selectStr = null;
      this._populates = [];
      this._sortObj = null;
      this._skipVal = null;
      this._limitVal = null;
      this._isLean = false;
    }

    /** Chỉ định các trường cần lấy hoặc loại trừ tương tự Mongoose `.select()`. */
    select(selectStr) {
      this._selectStr = selectStr;
      return this;
    }

    /** Đăng ký nạp thêm dữ liệu từ các bảng tham chiếu cho kết quả truy vấn. */
    populate(arg1, arg2) {
      this._populates.push(...normalizePopulateArgs(arg1, arg2));
      return this;
    }

    /** Thiết lập thứ tự sắp xếp bản ghi (`{ field: -1 | 1 }`). */
    sort(sortObj) {
      this._sortObj = sortObj;
      return this;
    }

    /** Bỏ qua `value` bản ghi đầu tiên (`OFFSET` trong SQL) phục vụ phân trang. */
    skip(value) {
      this._skipVal = value;
      return this;
    }

    /** Giới hạn số lượng bản ghi trả về tối đa (`LIMIT` trong SQL). */
    limit(value) {
      this._limitVal = value;
      return this;
    }

    /** Bật chế độ trả về plain JS object thuần thay vì `PgDocument` để tăng hiệu năng đọc. */
    lean() {
      this._isLean = true;
      return this;
    }

    /**
     * Biên dịch câu lệnh SQL tương ứng với `this._mode`, thực thi trên `pg.Pool`
     * và chuyển qua `_hydrate()` để lọc trường, populate và đóng gói kết quả.
     * @returns {Promise<PgDocument|Array<PgDocument>|Object|Array<Object>|null>} Kết quả truy vấn.
     */
    async exec() {
      const activePool = getPool();

      if (this._mode === "findOneAndUpdate") {
        const row = await executeFindOneAndUpdate(
          this._filter,
          this._extra.update,
          this._extra.options,
        );
        if (!row) return null;
        return this._hydrate([row], true);
      }

      if (this._mode === "findByIdAndDelete") {
        const result = await activePool.query(
          `DELETE FROM ${tableName} WHERE "id" = $1 RETURNING *`,
          [String(this._filter._id)],
        );
        if (!result.rows[0]) return null;
        return this._hydrate([result.rows[0]], true);
      }

      const { clause, params } = compileWhereClause(this._filter, schema, 1);
      const sortClause = compileSortClause(this._sortObj);
      const effectiveLimit =
        this._mode === "findOne" ? 1 : this._limitVal;

      let sql = `SELECT * FROM ${tableName} WHERE ${clause}`;
      if (sortClause) sql += ` ${sortClause}`;
      if (Number.isInteger(effectiveLimit) && effectiveLimit >= 0) {
        params.push(effectiveLimit);
        sql += ` LIMIT $${params.length}`;
      }
      if (Number.isInteger(this._skipVal) && this._skipVal > 0) {
        params.push(this._skipVal);
        sql += ` OFFSET $${params.length}`;
      }

      const result = await activePool.query(sql, params);
      if (this._mode === "findOne") {
        if (!result.rows[0]) return null;
        return this._hydrate([result.rows[0]], true);
      }
      return this._hydrate(result.rows, false);
    }

    /**
     * Biến đổi các dòng SQL thô thành plain object (khi `.lean()`) hoặc `PgDocument`,
     * áp dụng `.select()` và thực thi `.populate()`.
     * @param {Array<Object>} rows - Các dòng dữ liệu trả về từ PostgreSQL.
     * @param {boolean} single - `true` nếu chỉ trả về một phần tử đơn lẻ (`findOne`), `false` nếu trả về mảng.
     * @returns {Promise<PgDocument|Array<PgDocument>|Object|Array<Object>>} Dữ liệu đã hydrate.
     */
    async _hydrate(rows, single) {
      const selectSpec = parseSelectSpec(schema, this._selectStr);
      const rawObjects = rows.map((row) => rowToRawObject(row, schema));

      if (this._isLean) {
        const projected = rawObjects.map((obj) =>
          projectRowFields(obj, selectSpec),
        );
        await applyPopulates(projected, schema, this._populates);
        return single ? projected[0] : projected;
      }

      const docs = rawObjects.map((obj) => {
        const projected = projectRowFields(obj, selectSpec);
        return new PgDocument(projected, {
          isNew: false,
          fromDb: true,
          allowedFields: selectSpec.visibleFields,
        });
      });

      if (this._populates.length > 0) {
        await applyPopulates(
          docs.map((d) => d._data),
          schema,
          this._populates,
        );
      }

      return single ? docs[0] : docs;
    }

    /** Hỗ trợ cú pháp `await Model.find(...)` trực tiếp (Thenable interface). */
    then(resolve, reject) {
      return this.exec().then(resolve, reject);
    }

    /** Hỗ trợ bắt lỗi `.catch(...)` trực tiếp trên QueryBuilder. */
    catch(reject) {
      return this.exec().catch(reject);
    }

    /** Hỗ trợ `.finally(...)` trực tiếp trên QueryBuilder. */
    finally(cb) {
      return this.exec().finally(cb);
    }
  }

  /**
   * Thực thi nguyên tử (atomic) thao tác tìm và cập nhật một bản ghi trong PostgreSQL.
   * Hỗ trợ:
   * - `options.upsert`: Dùng `INSERT ... ON CONFLICT ("id") DO UPDATE` (ví dụ: tăng sequence trong `TicketCounter`).
   * - Các toán tử `$set`, `$inc`, `$push` (nối mảng JSONB), `$max` (`GREATEST`) và `$setOnInsert`.
   * - Dùng `CTE ... FOR UPDATE` để khóa hàng trong lúc cập nhật và trả về bản ghi mới (`options.new !== false`)
   *   hoặc bản ghi trước khi cập nhật (`options.new === false`).
   * @param {Object} filter - Điều kiện tìm bản ghi cần cập nhật.
   * @param {Object} [update={}] - Dữ liệu và toán tử cập nhật.
   * @param {Object} [options={}] - Tùy chọn `{ upsert, new }`.
   * @returns {Promise<Object|null>} Bản ghi PostgreSQL sau/trước khi cập nhật hoặc `null` nếu không khớp.
   */
  async function executeFindOneAndUpdate(filter, update = {}, options = {}) {
    const activePool = getPool();
    const now = new Date();
    const setObj = { ...(update.$set ?? {}) };
    const incObj = { ...(update.$inc ?? {}) };
    const pushObj = { ...(update.$push ?? {}) };
    const maxObj = { ...(update.$max ?? {}) };
    const setOnInsertObj = { ...(update.$setOnInsert ?? {}) };

    // Handle direct key assignments in update (outside $ operators)
    for (const [k, v] of Object.entries(update)) {
      if (!k.startsWith("$")) {
        setObj[k] = v;
      }
    }

    // Nhánh UPSERT theo khóa chính id: chèn mới nếu chưa có, hoặc cập nhật cộng dồn nếu xung đột id
    if (options.upsert && filter?._id !== undefined) {
      const idVal = String(filter._id);
      const insertFields = { _id: idVal, ...setOnInsertObj, ...setObj };
      for (const [k, delta] of Object.entries(incObj)) {
        insertFields[k] = (insertFields[k] ?? 0) + delta;
      }
      if (schema.options.timestamps) {
        insertFields.createdAt = insertFields.createdAt ?? now;
        insertFields.updatedAt = now;
      }

      const insertCols = [];
      const insertPlaceholders = [];
      const values = [];

      for (const [k, v] of Object.entries(insertFields)) {
        insertCols.push(`"${toSnakeCase(k)}"`);
        values.push(v);
        insertPlaceholders.push(`$${values.length}`);
      }

      const conflictUpdates = [];
      for (const [k, v] of Object.entries(setObj)) {
        values.push(v);
        conflictUpdates.push(`"${toSnakeCase(k)}" = $${values.length}`);
      }
      for (const [k, delta] of Object.entries(incObj)) {
        const col = `"${toSnakeCase(k)}"`;
        values.push(delta);
        conflictUpdates.push(`${col} = ${tableName}.${col} + $${values.length}`);
      }
      if (schema.options.timestamps) {
        values.push(now);
        conflictUpdates.push(`"updated_at" = $${values.length}`);
      }

      const sql = `
        INSERT INTO ${tableName} (${insertCols.join(", ")})
        VALUES (${insertPlaceholders.join(", ")})
        ON CONFLICT ("id") DO UPDATE SET ${conflictUpdates.join(", ")}
        RETURNING *
      `;
      try {
        const result = await activePool.query(sql, values);
        return result.rows[0] ?? null;
      } catch (error) {
        throw mapPgError(error);
      }
    }

    const { clause, params } = compileWhereClause(filter, schema, 1);
    const setParts = [];

    for (const [k, v] of Object.entries(setObj)) {
      const spec = schemaFields[k];
      const coerced = spec ? coerceValue(v, spec, k) : v;
      params.push(
        spec && isJsonField(spec) ? JSON.stringify(coerced) : coerced,
      );
      setParts.push(`"${toSnakeCase(k)}" = $${params.length}`);
    }

    for (const [k, delta] of Object.entries(incObj)) {
      const col = `"${toSnakeCase(k)}"`;
      params.push(delta);
      setParts.push(`${col} = ${tableName}.${col} + $${params.length}`);
    }

    // Hỗ trợ $push vào cột mảng JSONB bằng toán tử nối JSONB (||)
    for (const [k, pushedItem] of Object.entries(pushObj)) {
      const col = `"${toSnakeCase(k)}"`;
      const spec = schemaFields[k];
      const normalizedItem =
        Array.isArray(spec?.type) && spec.type[0] instanceof Schema
          ? normalizeSubdocObject(pushedItem, spec.type[0])
          : pushedItem;
      params.push(JSON.stringify([normalizedItem]));
      setParts.push(`${col} = COALESCE(${tableName}.${col}, '[]'::jsonb) || $${params.length}::jsonb`);
    }

    for (const [k, maxVal] of Object.entries(maxObj)) {
      const col = `"${toSnakeCase(k)}"`;
      params.push(maxVal);
      const pRef = `$${params.length}`;
      setParts.push(
        `${col} = GREATEST(COALESCE(${tableName}.${col}, ${pRef}), ${pRef})`,
      );
    }

    if (schema.options.timestamps && !("updatedAt" in setObj)) {
      params.push(now);
      setParts.push(`"updated_at" = $${params.length}`);
    }

    // Khóa bản ghi mục tiêu bằng FOR UPDATE để đảm bảo cập nhật an toàn dưới tải đồng thời
    const returnUpdated = options.new !== false;
    const sql = returnUpdated
      ? `
        WITH target AS (
          SELECT "id" FROM ${tableName} WHERE ${clause} LIMIT 1 FOR UPDATE
        )
        UPDATE ${tableName}
        SET ${setParts.join(", ")}
        FROM target
        WHERE ${tableName}."id" = target."id"
        RETURNING ${tableName}.*
      `
      : `
        WITH target AS (
          SELECT * FROM ${tableName} WHERE ${clause} LIMIT 1 FOR UPDATE
        ),
        updated AS (
          UPDATE ${tableName}
          SET ${setParts.join(", ")}
          FROM target
          WHERE ${tableName}."id" = target."id"
        )
        SELECT * FROM target
      `;

    try {
      const result = await activePool.query(sql, params);
      return result.rows[0] ?? null;
    } catch (error) {
      throw mapPgError(error);
    }
  }

  /**
   * Lớp Model công khai trả về từ `createModel(...)`, cung cấp các phương thức static
   * tương thích Mongoose (`find`, `findOne`, `findById`, `create`, `countDocuments`, `aggregate`...).
   * @extends PgDocument
   */
  class PgModel extends PgDocument {
    static modelName = modelName;
    static tableName = tableName;
    static schema = schema;

    /** Phương thức giữ chỗ tương thích `Model.init()` (index đã tạo trong `SCHEMA_SQL`). */
    static async init() {
      return true;
    }

    /** Tạo truy vấn tìm kiếm danh sách bản ghi thỏa mãn `filter`. */
    static find(filter = {}) {
      return new QueryBuilder("find", filter);
    }

    /** Tạo truy vấn tìm kiếm bản ghi đầu tiên thỏa mãn `filter`. */
    static findOne(filter = {}) {
      return new QueryBuilder("findOne", filter);
    }

    /** Tạo truy vấn tìm kiếm bản ghi theo khóa chính `_id`. */
    static findById(id) {
      return new QueryBuilder("findOne", { _id: id });
    }

    /** Tạo truy vấn tìm một bản ghi theo `filter` và cập nhật nguyên tử theo `update`. */
    static findOneAndUpdate(filter, update, options = {}) {
      return new QueryBuilder("findOneAndUpdate", filter, { update, options });
    }

    /** Tạo truy vấn tìm bản ghi theo `_id` và cập nhật nguyên tử theo `update`. */
    static findByIdAndUpdate(id, update, options = {}) {
      return new QueryBuilder("findOneAndUpdate", { _id: id }, { update, options });
    }

    /** Tạo truy vấn xóa một bản ghi theo `_id` và trả về bản ghi vừa xóa. */
    static findByIdAndDelete(id) {
      return new QueryBuilder("findByIdAndDelete", { _id: id });
    }

    /**
     * Khởi tạo và lưu một bản ghi hoặc danh sách bản ghi mới xuống PostgreSQL (kèm validate và pre-save hooks).
     * @param {Object|Array<Object>} input - Dữ liệu một document hoặc mảng nhiều document.
     * @returns {Promise<PgDocument|Array<PgDocument>>} Document hoặc mảng document đã lưu.
     */
    static async create(input) {
      if (Array.isArray(input)) {
        const docs = [];
        for (const item of input) {
          const doc = new PgModel(item);
          await doc.save();
          docs.push(doc);
        }
        return docs;
      }
      const doc = new PgModel(input);
      await doc.save();
      return doc;
    }

    /**
     * Kiểm tra nhanh xem có ít nhất một bản ghi thỏa mãn `filter` hay không.
     * @param {Object} [filter={}] - Điều kiện lọc.
     * @returns {Promise<{_id: string}|null>} Object chứa `_id` bản ghi đầu tiên hoặc `null`.
     */
    static async exists(filter = {}) {
      const { clause, params } = compileWhereClause(filter, schema, 1);
      const result = await getPool().query(
        `SELECT "id" FROM ${tableName} WHERE ${clause} LIMIT 1`,
        params,
      );
      return result.rows[0] ? { _id: result.rows[0].id } : null;
    }

    /**
     * Đếm tổng số bản ghi thỏa mãn điều kiện `filter`.
     * @param {Object} [filter={}] - Điều kiện lọc.
     * @returns {Promise<number>} Số lượng bản ghi đếm được.
     */
    static async countDocuments(filter = {}) {
      const { clause, params } = compileWhereClause(filter, schema, 1);
      const result = await getPool().query(
        `SELECT COUNT(*)::INTEGER AS total FROM ${tableName} WHERE ${clause}`,
        params,
      );
      return result.rows[0]?.total ?? 0;
    }

    /**
     * Xóa tối đa 1 bản ghi đầu tiên thỏa mãn `filter`.
     * @param {Object} [filter={}] - Điều kiện lọc.
     * @returns {Promise<{deletedCount: number}>} Số bản ghi đã xóa.
     */
    static async deleteOne(filter = {}) {
      const { clause, params } = compileWhereClause(filter, schema, 1);
      const result = await getPool().query(
        `DELETE FROM ${tableName} WHERE "id" IN (SELECT "id" FROM ${tableName} WHERE ${clause} LIMIT 1)`,
        params,
      );
      return { deletedCount: result.rowCount ?? 0 };
    }

    /**
     * Xóa toàn bộ bản ghi thỏa mãn `filter`.
     * @param {Object} [filter={}] - Điều kiện lọc.
     * @returns {Promise<{deletedCount: number}>} Tổng số bản ghi đã xóa.
     */
    static async deleteMany(filter = {}) {
      const { clause, params } = compileWhereClause(filter, schema, 1);
      const result = await getPool().query(
        `DELETE FROM ${tableName} WHERE ${clause}`,
        params,
      );
      return { deletedCount: result.rowCount ?? 0 };
    }

    /**
     * Thực thi Aggregation Pipeline trên bảng PostgreSQL.
     * Tối ưu hóa bằng cách đẩy các stage `$match` đứng đầu pipeline xuống thành SQL `WHERE`
     * trước khi chạy các stage còn lại (`$group`, `$sort`, `$facet`...) trên JavaScript.
     * @param {Array<Object>} [pipeline=[]] - Mảng các stage aggregation.
     * @returns {Promise<Array<Object>>} Kết quả sau toàn bộ pipeline.
     */
    static async aggregate(pipeline = []) {
      const leadingSqlMatches = [];
      let stageIndex = 0;

      // Gom các stage $match liên tiếp ở đầu pipeline để lọc trước ở tầng SQL PostgreSQL
      while (
        stageIndex < pipeline.length &&
        "$match" in pipeline[stageIndex]
      ) {
        leadingSqlMatches.push(pipeline[stageIndex].$match);
        stageIndex += 1;
      }

      const combinedFilter =
        leadingSqlMatches.length === 0
          ? {}
          : leadingSqlMatches.length === 1
            ? leadingSqlMatches[0]
            : { $and: leadingSqlMatches };

      const { clause, params } = compileWhereClause(combinedFilter, schema, 1);
      const result = await getPool().query(
        `SELECT * FROM ${tableName} WHERE ${clause}`,
        params,
      );
      const rows = result.rows.map((row) => rowToRawObject(row, schema));
      return runAggregatePipeline(rows, pipeline.slice(stageIndex));
    }
  }

  // Đăng ký Model vào registry để các Model khác có thể tham chiếu qua populate()
  modelRegistry.set(modelName, PgModel);
  return PgModel;
}
