import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";

process.env.NODE_ENV = "test";

const [
  { validateAdminUser, validateAdminUserStatus, validateCategory, validateTechnician },
  { publishDataChanged, subscribeToRealtimeEvents },
] = await Promise.all([
  import("../src/validators/adminValidators.js"),
  import("../src/services/realtimeService.js"),
]);

function runMiddleware(middleware, request) {
  return new Promise((resolve) => middleware(request, {}, (error) => resolve(error)));
}

test("validateTechnician chuẩn hóa dữ liệu tài khoản kỹ thuật viên", async () => {
  const request = {
    method: "POST",
    body: {
      fullName: "  Nguyễn Văn Kỹ  ",
      email: "  TECH@EXAMPLE.COM ",
      phone: "0901234567",
      specialization: "  Hạ tầng mạng ",
      status: "online",
      password: "Password123",
    },
  };

  assert.equal(await runMiddleware(validateTechnician, request), undefined);
  assert.equal(request.body.fullName, "Nguyễn Văn Kỹ");
  assert.equal(request.body.email, "tech@example.com");
  assert.equal(request.body.specialization, "Hạ tầng mạng");
});

test("validateTechnician bắt buộc mật khẩu mạnh khi tạo mới", async () => {
  const error = await runMiddleware(validateTechnician, {
    method: "POST",
    body: {
      fullName: "Kỹ thuật viên",
      email: "tech@example.com",
      phone: "0901234567",
      specialization: "Mạng",
      status: "online",
      password: "weak",
    },
  });

  assert.equal(error.statusCode, 400);
  assert.match(error.details.join(" "), /ít nhất 8 ký tự/);
});

test("validateCategory giữ đúng trạng thái ẩn của danh mục", async () => {
  const request = {
    body: { name: "  Phần cứng  ", description: "  Thiết bị vật lý  ", isActive: false },
  };

  assert.equal(await runMiddleware(validateCategory, request), undefined);
  assert.deepEqual(request.body, {
    name: "Phần cứng",
    description: "Thiết bị vật lý",
    isActive: false,
  });
});

test("validateAdminUser chuẩn hóa và kiểm tra payload người dùng", async () => {
  const request = {
    method: "POST",
    body: {
      fullName: "  Nguyễn Văn B  ",
      email: "  USERB@EXAMPLE.COM ",
      phone: "0901234567",
      department: " Kế toán ",
      role: "user",
      status: "locked",
      password: "Password123",
    },
  };

  assert.equal(await runMiddleware(validateAdminUser, request), undefined);
  assert.equal(request.body.fullName, "Nguyễn Văn B");
  assert.equal(request.body.email, "userb@example.com");
  assert.equal(request.body.department, "Kế toán");
  assert.equal(request.body.status, "inactive");
});

test("validateAdminUserStatus kiểm tra trạng thái active hoặc locked", async () => {
  const okRequest = { body: { status: "locked" } };
  assert.equal(await runMiddleware(validateAdminUserStatus, okRequest), undefined);
  assert.equal(okRequest.body.status, "inactive");

  const badRequest = { body: { status: "unknown" } };
  const err = await runMiddleware(validateAdminUserStatus, badRequest);
  assert.equal(err.statusCode, 400);
});

test("realtime service phát data-changed tới subscriber đang kết nối", () => {
  const request = new EventEmitter();
  const writes = [];
  const response = {
    status() { return this; },
    set() { return this; },
    flushHeaders() {},
    write(chunk) { writes.push(chunk); },
  };

  subscribeToRealtimeEvents(request, response);
  publishDataChanged("tickets");
  request.emit("close");

  assert.match(writes.join(""), /event: connected/);
  assert.match(writes.join(""), /event: data-changed/);
  assert.match(writes.join(""), /"resource":"tickets"/);
});
