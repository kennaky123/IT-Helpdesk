/**
 * @file authStorage.js
 * @description Tiện ích lưu trữ, đọc, kiểm tra hạn sử dụng JWT và xóa phiên đăng nhập trên trình duyệt.
 * Vai trò trong kiến trúc Frontend: Thuộc tầng Utility helpers, quản lý tính bền vững của token và
 * thông tin user qua `localStorage` (ghi nhớ đăng nhập) hoặc `sessionStorage` (theo phiên tab).
 */
import { USER_ROLES } from "../constants/roles.js";

const SESSION_STORAGE_KEY = "it-helpdesk-auth-session";
const LEGACY_STORAGE_KEY = "it-helpdesk-demo-user";
const STORAGE_VERSION = 1;

/**
 * Trả về danh sách các kho lưu trữ theo thứ tự ưu tiên đọc phiên: `localStorage` trước, `sessionStorage` sau.
 *
 * @returns {Array<{ storage: Storage, rememberMe: boolean }>}
 */
function getStorageEntries() {
  return [
    { storage: window.localStorage, rememberMe: true },
    { storage: window.sessionStorage, rememberMe: false },
  ];
}

/**
 * Giải mã phần payload JSON bên trong JWT access token (hỗ trợ chuẩn Base64URL).
 *
 * @param {string} accessToken - Chuỗi JWT gồm 3 phần phân tách bởi dấu chấm.
 * @returns {object | null} Payload đã parse hoặc `null` nếu token sai định dạng.
 */
function decodeJwtPayload(accessToken) {
  try {
    const payload = accessToken.split(".")[1];

    if (!payload) {
      return null;
    }

    // Chuyển đổi Base64URL (-, _) sang Base64 chuẩn (+, /) và bù dấu '=' cho đủ bội số 4
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const paddedBase64 = base64.padEnd(
      base64.length + ((4 - (base64.length % 4)) % 4),
      "=",
    );

    return JSON.parse(window.atob(paddedBase64));
  } catch {
    return null;
  }
}

/**
 * Kiểm tra xem JWT access token đã hết hạn sử dụng (`exp`) so với thời gian hiện tại hay chưa.
 *
 * @param {string} accessToken - Chuỗi JWT cần kiểm tra.
 * @returns {boolean} `true` nếu không có trường `exp` hoặc đã quá hạn.
 */
function isExpired(accessToken) {
  const payload = decodeJwtPayload(accessToken);
  // Trường exp trong JWT tính bằng giây nên cần nhân 1000 để so sánh với Date.now() (ms)
  return !payload?.exp || Date.now() >= payload.exp * 1000;
}

/**
 * Kiểm tra tính toàn vẹn của đối tượng phiên đăng nhập đọc từ storage hoặc chuẩn bị lưu.
 *
 * @param {any} value - Đối tượng phiên đăng nhập.
 * @returns {boolean} `true` nếu đúng schema version, có token còn hạn, email và vai trò hợp lệ.
 */
function isValidSession(value) {
  return Boolean(
    value &&
      value.version === STORAGE_VERSION &&
      typeof value.accessToken === "string" &&
      value.accessToken.length > 0 &&
      typeof value.user?.email === "string" &&
      USER_ROLES.includes(value.user?.role) &&
      !isExpired(value.accessToken),
  );
}

/**
 * Đọc và kiểm chứng dữ liệu phiên đăng nhập từ một kho lưu trữ (`localStorage` hoặc `sessionStorage`).
 * Tự động xóa mục lưu trữ nếu JSON hỏng hoặc token đã hết hạn.
 *
 * @param {{ storage: Storage, rememberMe: boolean }} storageEntry - Cặp kho lưu trữ và cờ rememberMe tương ứng.
 * @returns {object | null} Phiên hợp lệ kèm thuộc tính `rememberMe`, hoặc `null`.
 */
function readStorageEntry(storageEntry) {
  try {
    const storedValue = storageEntry.storage.getItem(SESSION_STORAGE_KEY);

    if (!storedValue) {
      return null;
    }

    const parsedValue = JSON.parse(storedValue);

    // Dọn dẹp ngay dữ liệu lỗi thời hoặc token hết hạn khỏi storage
    if (!isValidSession(parsedValue)) {
      storageEntry.storage.removeItem(SESSION_STORAGE_KEY);
      return null;
    }

    return {
      ...parsedValue,
      rememberMe: storageEntry.rememberMe,
    };
  } catch {
    try {
      storageEntry.storage.removeItem(SESSION_STORAGE_KEY);
    } catch {
      // Bỏ qua nếu trình duyệt không cho phép truy cập storage.
    }

    return null;
  }
}

/**
 * Tìm và trả về phiên đăng nhập hợp lệ đầu tiên từ `localStorage` hoặc `sessionStorage`.
 *
 * @returns {object | null} Phiên đăng nhập hiện tại hoặc `null` nếu chưa đăng nhập / đã hết hạn.
 */
export function getStoredAuthSession() {
  for (const storageEntry of getStorageEntries()) {
    const session = readStorageEntry(storageEntry);

    if (session) {
      return session;
    }
  }

  return null;
}

/**
 * Lấy nhanh chuỗi JWT access token hiện hành từ phiên đã lưu.
 *
 * @returns {string | null} Access token hoặc `null`.
 */
export function getStoredAccessToken() {
  return getStoredAuthSession()?.accessToken ?? null;
}

/**
 * Xóa toàn bộ dữ liệu phiên đăng nhập (kể cả key phiên bản cũ) khỏi cả `localStorage` và `sessionStorage`.
 *
 * @returns {void}
 */
export function clearAuthSession() {
  for (const storageEntry of getStorageEntries()) {
    try {
      storageEntry.storage.removeItem(SESSION_STORAGE_KEY);
      storageEntry.storage.removeItem(LEGACY_STORAGE_KEY);
    } catch {
      // Không chặn đăng xuất nếu trình duyệt không cho phép truy cập storage.
    }
  }
}

/**
 * Lưu phiên đăng nhập mới vào `localStorage` (nếu chọn ghi nhớ) hoặc `sessionStorage`.
 * Có cơ chế dự phòng sang `sessionStorage` nếu ghi vào `localStorage` thất bại.
 *
 * @param {object} authenticationData - Gói `{ user, accessToken, tokenType?, expiresIn? }` từ API.
 * @param {boolean} rememberMe - Chọn `true` để lưu bền vững qua `localStorage`.
 * @returns {object} Đối tượng phiên đã chuẩn hóa vừa lưu.
 */
export function saveAuthSession(authenticationData, rememberMe) {
  const session = {
    version: STORAGE_VERSION,
    user: authenticationData.user,
    accessToken: authenticationData.accessToken,
    tokenType: authenticationData.tokenType ?? "Bearer",
    expiresIn: authenticationData.expiresIn ?? null,
    savedAt: new Date().toISOString(),
  };

  // Ngăn việc lưu phiên thiếu token, sai role hoặc token đã hết hạn
  if (!isValidSession(session)) {
    throw new Error("Không thể lưu phiên đăng nhập không hợp lệ.");
  }

  // Xóa sạch phiên cũ ở cả hai kho trước khi ghi để tránh tồn tại bản ghi trùng lặp
  clearAuthSession();

  const preferredStorage = rememberMe
    ? window.localStorage
    : window.sessionStorage;

  try {
    preferredStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Fallback sang sessionStorage nếu trình duyệt chặn hoặc đầy dung lượng localStorage
    if (rememberMe) {
      window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    } else {
      throw new Error("Trình duyệt không thể lưu phiên đăng nhập.");
    }
  }

  return session;
}

/**
 * Cập nhật riêng thông tin `user` trong phiên đang lưu mà vẫn giữ nguyên `accessToken` và `rememberMe`.
 *
 * @param {object} user - Đối tượng user mới nhận từ `/auth/me` hoặc API cập nhật hồ sơ.
 * @returns {void}
 */
export function updateStoredUser(user) {
  const currentSession = getStoredAuthSession();

  if (!currentSession || !USER_ROLES.includes(user?.role)) {
    return;
  }

  saveAuthSession(
    {
      ...currentSession,
      user,
    },
    currentSession.rememberMe,
  );
}
