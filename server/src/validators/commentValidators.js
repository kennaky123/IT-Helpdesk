/**
 * @file commentValidators.js
 * @description Bộ middleware kiểm tra dữ liệu đầu vào cho luồng bình luận và ghi chú nội bộ trên Ticket.
 * Vai trò trong kiến trúc Backend: Thuộc tầng Validator (Express Middleware Validator), sử dụng trong
 * `ticketConversationRoutes.js` để xác thực nội dung comment và tham số phân trang danh sách hội thoại.
 */
import ApiError from "../utils/ApiError.js";

// Giới hạn số trang tối đa nhằm tránh lỗi tràn số hoặc truy vấn skip quá lớn
const MAX_PAGE = 1_000_000;

/**
 * Hàm phụ trợ phân tích chuỗi/số thành số nguyên không âm an toàn.
 * Trả về `fallback` nếu giá trị là `undefined`, hoặc `NaN` nếu sai định dạng số nguyên dương.
 */
function parsePositiveInteger(value, fallback) {
  if (value === undefined) {
    return fallback;
  }

  if (typeof value !== "string" && typeof value !== "number") {
    return Number.NaN;
  }

  const normalizedValue = String(value);

  // Chỉ chấp nhận chuỗi toàn chữ số để loại bỏ số âm, số thập phân hoặc ký tự lạ
  if (!/^\d+$/.test(normalizedValue)) {
    return Number.NaN;
  }

  const parsedValue = Number.parseInt(normalizedValue, 10);
  return Number.isSafeInteger(parsedValue) ? parsedValue : Number.NaN;
}

/**
 * Middleware validate nội dung tạo bình luận hoặc ghi chú nội bộ (`POST /comments`, `POST /internal-notes`).
 * Quy tắc: `content` từ 1 đến 5000 ký tự sau khi trim; nghiêm cấm client tự truyền `isInternal` trong body
 * để tránh giả mạo ghi chú nội bộ qua endpoint công khai.
 */
export function validateCreateComment(request, _response, next) {
  try {
    const body = request.body ?? {};
    const errors = [];
    const content =
      typeof body.content === "string" ? body.content.trim() : "";

    if (content.length < 1 || content.length > 5000) {
      errors.push("Nội dung trao đổi phải có từ 1 đến 5000 ký tự.");
    }

    // Chặn client tự đặt cờ isInternal; việc phân biệt được quyết định bởi URL endpoint (/comments vs /internal-notes)
    if (Object.hasOwn(body, "isInternal")) {
      errors.push(
        "Không gửi isInternal trong request; hãy sử dụng đúng endpoint.",
      );
    }

    // Làm sạch request.body chỉ giữ lại nội dung đã trim
    request.body = { content };

    if (errors.length > 0) {
      return next(
        new ApiError(400, "Dữ liệu comment không hợp lệ.", errors),
      );
    }

    return next();
  } catch (error) {
    return next(error);
  }
}

/**
 * Middleware validate tham số phân trang và sắp xếp danh sách bình luận (`GET /comments`).
 * Quy tắc: `page` (1..1_000_000, mặc định 1), `limit` (1..100, mặc định 20), `sortOrder` ("asc" hoặc "desc", mặc định "asc").
 * Gắn kết quả đã chuẩn hóa vào `request.commentQuery`.
 */
export function validateCommentListQuery(request, _response, next) {
  try {
    const query = request.query ?? {};
    const errors = [];
    const page = parsePositiveInteger(query.page, 1);
    const limit = parsePositiveInteger(query.limit, 20);
    const sortOrder = query.sortOrder ?? "asc";

    if (!Number.isSafeInteger(page) || page < 1 || page > MAX_PAGE) {
      errors.push(`Trang phải là số nguyên từ 1 đến ${MAX_PAGE}.`);
    }

    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      errors.push("Số comment mỗi trang phải nằm trong khoảng 1 đến 100.");
    }

    if (typeof sortOrder !== "string" || !["asc", "desc"].includes(sortOrder)) {
      errors.push("Thứ tự comment phải là asc hoặc desc.");
    }

    // Lưu tham số truy vấn sạch vào request.commentQuery cho controller dùng trực tiếp
    request.commentQuery = { page, limit, sortOrder };

    if (errors.length > 0) {
      return next(
        new ApiError(400, "Tham số danh sách comment không hợp lệ.", errors),
      );
    }

    return next();
  } catch (error) {
    return next(error);
  }
}
