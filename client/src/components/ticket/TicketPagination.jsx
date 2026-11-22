/**
 * TicketPagination.jsx
 *
 * Chức năng: Hiển thị thanh điều hướng phân trang và thống kê phạm vi ticket đang hiển thị.
 * Props:
 * - `pagination` (object): Thông tin phân trang từ API (`page`, `limit`, `totalItems`, `totalPages`, `hasPreviousPage`, `hasNextPage`).
 * - `onPageChange` (function): Callback nhận số trang mới khi người dùng bấm chuyển trang.
 * Vai trò: Điều khiển chuyển trang trong luồng danh sách ticket với cơ chế rút gọn số trang bằng dấu ba chấm (`…`)
 * khi tổng số trang lớn, tránh tràn giao diện.
 */
import { ChevronLeft, ChevronRight } from "lucide-react";

// Helper tính danh sách trang hiển thị: luôn giữ trang đầu, trang cuối, trang hiện tại cùng 2 trang liền kề và chèn `ellipsis` nếu có khoảng nhảy
function getVisiblePages(currentPage, totalPages) {
  // Dùng Set để tự động loại bỏ các số trang trùng nhau (ví dụ khi ở trang 1 hoặc trang cuối)
  const pageNumbers = new Set([
    1,
    totalPages,
    currentPage - 1,
    currentPage,
    currentPage + 1,
  ]);
  // Lọc các trang nằm ngoài biên [1, totalPages] rồi sắp xếp tăng dần
  const sortedPages = [...pageNumbers]
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((left, right) => left - right);
  const result = [];

  for (const page of sortedPages) {
    const previousPage = result.at(-1);

    // Nếu giữa 2 trang liên tiếp trong danh sách bị nhảy cóc hơn 1 đơn vị thì chèn dấu `…`
    if (typeof previousPage === "number" && page - previousPage > 1) {
      result.push(`ellipsis-${previousPage}-${page}`);
    }

    result.push(page);
  }

  return result;
}

// Component thanh phân trang ở chân danh sách ticket
function TicketPagination({ pagination, onPageChange }) {
  const { page, limit, totalItems, totalPages, hasPreviousPage, hasNextPage } =
    pagination;

  // Không render thanh phân trang nếu danh sách không có bản ghi nào
  if (totalItems === 0 || totalPages === 0) {
    return null;
  }

  // Tính chỉ số thứ tự ticket đầu và cuối của trang hiện tại (ví dụ: 1–10 trên tổng số 45)
  const firstItem = (page - 1) * limit + 1;
  const lastItem = Math.min(page * limit, totalItems);
  const visiblePages = getVisiblePages(page, totalPages);

  return (
    <nav
      className="flex flex-col gap-3 border-t border-brand-bone bg-brand-mist/40 px-4 py-3 text-xs text-brand-slate sm:flex-row sm:items-center sm:justify-between"
      aria-label="Phân trang danh sách ticket"
    >
      {/* Tóm tắt khoảng bản ghi đang xem */}
      <p className="text-center sm:text-left">
        Hiển thị <span className="font-semibold text-brand-ink">{firstItem}</span>
        –<span className="font-semibold text-brand-ink">{lastItem}</span> trên tổng
        số <span className="font-semibold text-brand-ink">{totalItems}</span>{" "}
        ticket
      </p>

      {/* Cụm nút điều hướng: Trước / Các số trang rút gọn / Sau */}
      <div className="flex items-center justify-center gap-1.5">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={!hasPreviousPage}
          className="inline-flex items-center gap-1 rounded-md border border-brand-bone bg-white px-2.5 py-1 font-medium text-brand-ink transition hover:bg-brand-mist disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Trang trước"
        >
          <ChevronLeft className="size-3.5" aria-hidden="true" />
          Trước
        </button>

        {/* Dãy nút số trang chỉ hiển thị từ màn hình `sm` trở lên; mobile chỉ dùng nút Trước/Sau */}
        <div className="hidden items-center gap-1 sm:flex">
          {visiblePages.map((item) =>
            typeof item === "number" ? (
              <button
                key={item}
                type="button"
                onClick={() => onPageChange(item)}
                className={[
                  "inline-flex h-7 min-w-7 items-center justify-center rounded-md px-2 text-xs font-bold transition",
                  item === page
                    ? "bg-brand-ink text-white"
                    : "border border-brand-bone bg-white text-brand-ink hover:bg-brand-mist",
                ].join(" ")}
                aria-label={`Trang ${item}`}
                aria-current={item === page ? "page" : undefined}
              >
                {item}
              </button>
            ) : (
              <span
                key={item}
                className="inline-flex h-7 items-center justify-center px-1 text-brand-ash"
                aria-hidden="true"
              >
                …
              </span>
            ),
          )}
        </div>

        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={!hasNextPage}
          className="inline-flex items-center gap-1 rounded-md border border-brand-bone bg-white px-2.5 py-1 font-medium text-brand-ink transition hover:bg-brand-mist disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Trang sau"
        >
          Sau
          <ChevronRight className="size-3.5" aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
}

export default TicketPagination;
