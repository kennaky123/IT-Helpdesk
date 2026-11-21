import crypto from "node:crypto";
import pg from "pg";
import { env } from "./env.js";

const { Pool } = pg;

const OBJECT_ID_REGEX = /^[a-fA-F0-9]{24}$/;

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

export function generateId() {
  return crypto.randomBytes(12).toString("hex");
}

export function isValidId(value) {
  return typeof value === "string" && OBJECT_ID_REGEX.test(value);
}

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

export const dbConnection = {
  get name() {
    return getDatabaseName();
  },
};

let pool = null;

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

async function ensureDatabaseExists() {
  const activePool = getPool();
  try {
    const client = await activePool.connect();
    client.release();
    return;
  } catch (error) {
    if (error.code !== "3D000") {
      throw error;
    }

    const dbName = getDatabaseName();
    if (!dbName) {
      throw error;
    }

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
        const safeName = dbName.replace(/"/g, '""');
        await adminPool.query(`CREATE DATABASE "${safeName}"`);
        console.log(`Đã tự động tạo PostgreSQL database: ${dbName}`);
      }
    } finally {
      await adminPool.end();
    }

    const retryClient = await activePool.connect();
    retryClient.release();
  }
}

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

function toSnakeCase(fieldName) {
  if (fieldName === "_id") return "id";
  if (fieldName === "__v") return "version";
  return fieldName.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function defaultTableName(modelName) {
  const snake = modelName
    .replace(/^[A-Z]/, (c) => c.toLowerCase())
    .replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
  if (snake.endsWith("y") && !/[aeiou]y$/.test(snake)) {
    return `${snake.slice(0, -1)}ies`;
  }
  return `${snake}s`;
}

function normalizeFieldSpec(spec) {
  if (!spec || typeof spec !== "object" || spec instanceof Schema) {
    return { type: spec };
  }
  if (Array.isArray(spec)) {
    return { type: spec };
  }
  if (!("type" in spec) && !("ref" in spec) && !("default" in spec) && !("enum" in spec)) {
    return { type: new Schema(spec) };
  }
  return spec;
}

export class Schema {
  static Types = Object.freeze({
    ObjectId: "ObjectId",
    String,
    Number,
    Boolean,
    Date,
  });

  constructor(definition, options = {}) {
    this.definition = definition;
    this.options = options;
    this.methods = {};
    this.preHooks = { save: [] };
    this.fields = {};

    for (const [key, rawSpec] of Object.entries(definition)) {
      this.fields[key] = normalizeFieldSpec(rawSpec);
    }

    if (options.timestamps) {
      if (!this.fields.createdAt) {
        this.fields.createdAt = { type: Date };
      }
      if (!this.fields.updatedAt) {
        this.fields.updatedAt = { type: Date };
      }
    }

    if (options.optimisticConcurrency && !this.fields.__v) {
      this.fields.__v = { type: Number, default: 0 };
    }
  }

  index() {
    // Indexes are managed by PostgreSQL DDL in SCHEMA_SQL
    return this;
  }

  pre(hookName, fn) {
    if (!this.preHooks[hookName]) {
      this.preHooks[hookName] = [];
    }
    this.preHooks[hookName].push(fn);
    return this;
  }
}

function mapPgError(error) {
  if (error?.code === "23505") {
    error.code = 11000;
  }
  return error;
}

function createValidationError(errorsMap) {
  const messages = Object.values(errorsMap).map((item) => item.message);
  const error = new Error(messages.join("; "));
  error.name = "ValidationError";
  error.errors = errorsMap;
  return error;
}

function extractTupleOption(option, defaultMsg) {
  if (Array.isArray(option)) {
    return [option[0], option[1] ?? defaultMsg];
  }
  if (option && typeof option === "object" && "values" in option) {
    return [option.values, option.message ?? defaultMsg];
  }
  return [option, defaultMsg];
}

function isJsonField(spec) {
  if (!spec) return false;
  if (Array.isArray(spec.type)) return true;
  if (spec.type instanceof Schema) return true;
  return false;
}

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

function resolveDefault(spec) {
  if (!("default" in spec)) return undefined;
  const def = spec.default;
  if (def === Date.now) return new Date();
  if (typeof def === "function") return def();
  if (Array.isArray(def)) return [...def];
  if (def && typeof def === "object") return { ...def };
  return def;
}

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

function validateValueAgainstSpec(value, spec, docContext, path, errorsMap) {
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

const modelRegistry = new Map();

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

async function applyPopulates(docs, sourceSchema, populateList) {
  if (!docs.length || !populateList.length) return docs;

  for (const pop of populateList) {
    const refModelName = getReferenceModelName(sourceSchema, pop.path);
    if (!refModelName) continue;
    const TargetModel = modelRegistry.get(refModelName);
    if (!TargetModel) continue;

    const parts = pop.path.split(".");
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

function parseSelectSpec(schema, selectStr) {
  const allFields = ["_id", ...Object.keys(schema.fields)];
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

function compileWhereClause(filter, schema, startIndex = 1) {
  const params = [];

  function pushParam(val) {
    params.push(val);
    return `$${startIndex + params.length - 1}`;
  }

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

function createAggregateEvaluator() {
  const dateFormatters = new Map();

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

  function runStage(rows, stage) {
    if ("$match" in stage) {
      return rows.filter((row) => matchDoc(row, stage.$match));
    }

    if ("$group" in stage) {
      const groupSpec = stage.$group;
      const groups = new Map();

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

  function runPipeline(initialRows, pipeline) {
    let current = initialRows;
    for (const stage of pipeline) {
      current = runStage(current, stage);
    }
    return current;
  }

  return runPipeline;
}

const runAggregatePipeline = createAggregateEvaluator();

export function createModel(modelName, schema, explicitTableName = null) {
  const tableName =
    explicitTableName || schema.options?.collection || defaultTableName(modelName);
  const schemaFields = schema.fields;
  const allFieldKeys = ["_id", ...Object.keys(schemaFields).filter((k) => k !== "_id")];

  class PgDocument {
    constructor(initialData = {}, options = {}) {
      const isNew = options.isNew ?? true;
      const fromDb = options.fromDb ?? false;
      const allowedFields = options.allowedFields ?? null;

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
        for (const key of keysToInit) {
          this._data[key] = initialData[key];
          this._persistedSnapshot[key] = clonePlainValue(initialData[key]);
        }
      } else {
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

    isModified(fieldName) {
      if (this._isNew) {
        return this._data[fieldName] !== undefined;
      }
      return this._modifiedFields.has(fieldName);
    }

    _normalizeJsonFields() {
      for (const [key, spec] of Object.entries(schemaFields)) {
        if (isJsonField(spec) && this._data[key] !== undefined) {
          this._data[key] = coerceValue(this._data[key], spec, key);
        }
      }
    }

    async validate() {
      this._normalizeJsonFields();
      const errorsMap = {};
      for (const [key, spec] of Object.entries(schemaFields)) {
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

    async populate(arg1, arg2) {
      const populateList = normalizePopulateArgs(arg1, arg2);
      await applyPopulates([this._data], schema, populateList);
      return this;
    }

    async deleteOne() {
      const result = await getPool().query(
        `DELETE FROM ${tableName} WHERE "id" = $1`,
        [this._data._id],
      );
      return { deletedCount: result.rowCount ?? 0 };
    }

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

    toObject() {
      return this._toPlain(schema.options.toObject);
    }

    toJSON() {
      return this._toPlain(schema.options.toJSON);
    }
  }

  for (const [methodName, fn] of Object.entries(schema.methods)) {
    PgDocument.prototype[methodName] = fn;
  }

  class QueryBuilder {
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

    select(selectStr) {
      this._selectStr = selectStr;
      return this;
    }

    populate(arg1, arg2) {
      this._populates.push(...normalizePopulateArgs(arg1, arg2));
      return this;
    }

    sort(sortObj) {
      this._sortObj = sortObj;
      return this;
    }

    skip(value) {
      this._skipVal = value;
      return this;
    }

    limit(value) {
      this._limitVal = value;
      return this;
    }

    lean() {
      this._isLean = true;
      return this;
    }

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

    then(resolve, reject) {
      return this.exec().then(resolve, reject);
    }

    catch(reject) {
      return this.exec().catch(reject);
    }

    finally(cb) {
      return this.exec().finally(cb);
    }
  }

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

  class PgModel extends PgDocument {
    static modelName = modelName;
    static tableName = tableName;
    static schema = schema;

    static async init() {
      return true;
    }

    static find(filter = {}) {
      return new QueryBuilder("find", filter);
    }

    static findOne(filter = {}) {
      return new QueryBuilder("findOne", filter);
    }

    static findById(id) {
      return new QueryBuilder("findOne", { _id: id });
    }

    static findOneAndUpdate(filter, update, options = {}) {
      return new QueryBuilder("findOneAndUpdate", filter, { update, options });
    }

    static findByIdAndUpdate(id, update, options = {}) {
      return new QueryBuilder("findOneAndUpdate", { _id: id }, { update, options });
    }

    static findByIdAndDelete(id) {
      return new QueryBuilder("findByIdAndDelete", { _id: id });
    }

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

    static async exists(filter = {}) {
      const { clause, params } = compileWhereClause(filter, schema, 1);
      const result = await getPool().query(
        `SELECT "id" FROM ${tableName} WHERE ${clause} LIMIT 1`,
        params,
      );
      return result.rows[0] ? { _id: result.rows[0].id } : null;
    }

    static async countDocuments(filter = {}) {
      const { clause, params } = compileWhereClause(filter, schema, 1);
      const result = await getPool().query(
        `SELECT COUNT(*)::INTEGER AS total FROM ${tableName} WHERE ${clause}`,
        params,
      );
      return result.rows[0]?.total ?? 0;
    }

    static async deleteOne(filter = {}) {
      const { clause, params } = compileWhereClause(filter, schema, 1);
      const result = await getPool().query(
        `DELETE FROM ${tableName} WHERE "id" IN (SELECT "id" FROM ${tableName} WHERE ${clause} LIMIT 1)`,
        params,
      );
      return { deletedCount: result.rowCount ?? 0 };
    }

    static async deleteMany(filter = {}) {
      const { clause, params } = compileWhereClause(filter, schema, 1);
      const result = await getPool().query(
        `DELETE FROM ${tableName} WHERE ${clause}`,
        params,
      );
      return { deletedCount: result.rowCount ?? 0 };
    }

    static async aggregate(pipeline = []) {
      const leadingSqlMatches = [];
      let stageIndex = 0;

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

  modelRegistry.set(modelName, PgModel);
  return PgModel;
}
