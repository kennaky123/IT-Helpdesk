/**
 * @file useTicketListQuery.js
 * @description Custom Hook đồng bộ hóa trạng thái tìm kiếm, bộ lọc, sắp xếp và phân trang ticket với URL Search Params.
 * Vai trò trong kiến trúc Frontend: Thuộc tầng Custom Hooks, quản lý state truy vấn dựa trên URL
 * (Single Source of Truth) giúp người dùng có thể chia sẻ link hoặc F5 mà không mất bộ lọc đang chọn.
 */
import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";

// Danh sách trắng (whitelist) các trạng thái ticket hợp lệ được phép nhận từ URL
const TICKET_STATUSES = new Set([
  "pending",
  "assigned",
  "in_progress",
  "waiting_user",
  "resolved",
  "closed",
  "cancelled",
]);
// Danh sách trắng các mức độ ưu tiên hợp lệ
const TICKET_PRIORITIES = new Set(["low", "medium", "high", "urgent"]);
// Biểu thức chính quy kiểm tra định dạng MongoDB ObjectId 24 ký tự hex
const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;
// Tập các trường bộ lọc hợp lệ được phép cập nhật qua setFilter
const FILTER_FIELDS = new Set([
  "search",
  "status",
  "priority",
  "category",
  "technician",
  "sortOrder",
]);
const PAGE_SIZE = 10;

/**
 * Chuẩn hóa chuỗi từ khóa tìm kiếm: cắt khoảng trắng đầu/cuối và giới hạn tối đa 100 ký tự.
 *
 * @param {unknown} value - Giá trị thô nhận từ URL hoặc ô nhập tìm kiếm.
 * @returns {string} Từ khóa đã làm sạch.
 */
function normalizeSearch(value) {
  return typeof value === "string" ? value.trim().slice(0, 100) : "";
}

/**
 * Chuẩn hóa số trang từ URL, chỉ chấp nhận số nguyên dương an toàn trong khoảng [1, 1.000.000].
 *
 * @param {string | null} value - Chuỗi tham số `page` trên URL.
 * @returns {number} Số trang hợp lệ (mặc định về 1 nếu không hợp lệ).
 */
function normalizePage(value) {
  if (!/^\d+$/.test(value ?? "")) {
    return 1;
  }

  const page = Number.parseInt(value, 10);
  return Number.isSafeInteger(page) && page >= 1 && page <= 1_000_000
    ? page
    : 1;
}

/**
 * Phân tích `URLSearchParams` và lọc dữ liệu theo whitelist để tạo object truy vấn an toàn cho API.
 *
 * @param {URLSearchParams} searchParams - Tham số URL hiện tại.
 * @returns {{
 *   search: string,
 *   status: string,
 *   priority: string,
 *   category: string,
 *   technician: string,
 *   sortOrder: "asc" | "desc",
 *   page: number,
 *   limit: number
 * }} Đối tượng query chuẩn hóa.
 */
function parseTicketQuery(searchParams) {
  const status = searchParams.get("status") ?? "";
  const priority = searchParams.get("priority") ?? "";
  const category = searchParams.get("category") ?? "";
  const technician = searchParams.get("technician") ?? "";
  // Mặc định sắp xếp giảm dần ("desc") nếu URL không chỉ định rõ "asc"
  const sortOrder = searchParams.get("sortOrder") === "asc" ? "asc" : "desc";

  // Chỉ giữ lại các giá trị khớp với whitelist / định dạng ObjectId để chống tham số URL rác
  return {
    search: normalizeSearch(searchParams.get("search") ?? ""),
    status: TICKET_STATUSES.has(status) ? status : "",
    priority: TICKET_PRIORITIES.has(priority) ? priority : "",
    category: OBJECT_ID_PATTERN.test(category) ? category : "",
    technician: OBJECT_ID_PATTERN.test(technician) ? technician : "",
    sortOrder,
    page: normalizePage(searchParams.get("page")),
    limit: PAGE_SIZE,
  };
}

/**
 * Quản lý và cập nhật các bộ lọc, sắp xếp và số trang của danh sách ticket thông qua URL query string.
 *
 * @returns {{
 *   query: object,
 *   setFilter: (field: string, rawValue: string) => void,
 *   setPage: (page: number) => void,
 *   resetFilters: () => void,
 *   activeFilterCount: number,
 *   hasActiveFilters: boolean
 * }} Object truy vấn hiện tại, các hàm cập nhật URL và thống kê bộ lọc đang bật.
 */
function useTicketListQuery() {
  const [searchParams, setSearchParams] = useSearchParams();
  // Chuyển sang chuỗi làm key memoization nhằm giữ ổn định tham chiếu `query` cho React Query
  const searchParamsKey = searchParams.toString();
  const query = useMemo(
    () => parseTicketQuery(new URLSearchParams(searchParamsKey)),
    [searchParamsKey],
  );

  /**
   * Cập nhật một trường bộ lọc hoặc thứ tự sắp xếp lên URL và tự động đưa về trang 1.
   */
  const setFilter = useCallback(
    (field, rawValue) => {
      // Bỏ qua nếu tên trường không nằm trong danh sách cho phép
      if (!FILTER_FIELDS.has(field)) {
        return;
      }

      const value = field === "search" ? normalizeSearch(rawValue) : rawValue;

      setSearchParams((currentParams) => {
        const nextParams = new URLSearchParams(currentParams);

        // Xóa param khỏi URL nếu rỗng hoặc là giá trị sắp xếp mặc định ("desc") để giữ URL gọn sạch
        if (!value || (field === "sortOrder" && value === "desc")) {
          nextParams.delete(field);
        } else {
          nextParams.set(field, value);
        }

        // Khi thay đổi điều kiện lọc, luôn reset phân trang về trang đầu tiên
        nextParams.delete("page");
        nextParams.delete("limit");
        return nextParams;
      });
    },
    [setSearchParams],
  );

  /**
   * Chuyển sang trang mới trên URL (ẩn tham số `page` nếu là trang 1).
   */
  const setPage = useCallback(
    (page) => {
      if (!Number.isInteger(page) || page < 1) {
        return;
      }

      setSearchParams((currentParams) => {
        const nextParams = new URLSearchParams(currentParams);

        if (page === 1) {
          nextParams.delete("page");
        } else {
          nextParams.set("page", String(page));
        }

        nextParams.delete("limit");
        return nextParams;
      });
    },
    [setSearchParams],
  );

  /**
   * Xóa toàn bộ bộ lọc và tham số phân trang về trạng thái mặc định.
   */
  const resetFilters = useCallback(() => {
    setSearchParams(new URLSearchParams());
  }, [setSearchParams]);

  // Đếm số lượng bộ lọc thực tế đang được áp dụng (không tính sortOrder)
  const activeFilterCount = [
    query.search,
    query.status,
    query.priority,
    query.category,
    query.technician,
  ].filter(Boolean).length;

  return {
    query,
    setFilter,
    setPage,
    resetFilters,
    activeFilterCount,
    hasActiveFilters: activeFilterCount > 0 || query.sortOrder !== "desc",
  };
}

export default useTicketListQuery;
