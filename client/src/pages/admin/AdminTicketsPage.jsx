/**
 * Trang Quản lý Hàng đợi Ticket (Admin Tickets Queue).
 *
 * Vai trò trong hệ thống IT Helpdesk:
 * - Là màn hình điều phối ticket tập trung cho Admin, kết hợp thanh chỉ số vận hành 5 ô
 *   (tổng ticket, ticket khẩn cấp P1, ticket chưa phân công, MTTR, điểm hài lòng CSAT).
 * - Tích hợp bộ lọc đa tiêu chí đồng bộ URL (trạng thái, độ ưu tiên, danh mục, kỹ thuật viên, tìm kiếm)
 *   và phân trang danh sách ticket phục vụ kiểm tra, phân công và theo dõi SLA.
 */
import { useMemo } from "react";
import { Link } from "react-router-dom";
import TicketFilters from "../../components/ticket/TicketFilters.jsx";
import TicketList from "../../components/ticket/TicketList.jsx";
import TicketListEmptyState from "../../components/ticket/TicketListEmptyState.jsx";
import TicketListErrorState from "../../components/ticket/TicketListErrorState.jsx";
import TicketListSkeleton from "../../components/ticket/TicketListSkeleton.jsx";
import TicketPagination from "../../components/ticket/TicketPagination.jsx";
import useAdminDashboard from "../../hooks/useAdminDashboard.js";
import useTicketList, {
  useTicketFilterOptions,
} from "../../hooks/useTicketList.js";
import useTicketListQuery from "../../hooks/useTicketListQuery.js";
import { getTicketListErrorMessage } from "../../services/ticketService.js";

/**
 * Helper định dạng chỉ số thời gian xử lý trung bình (MTTR) hiển thị trên thẻ KPI.
 */
function formatResolutionMetric(resolutionTime) {
  if (!resolutionTime || resolutionTime.minutes == null) {
    return "Chưa có";
  }
  if (resolutionTime.minutes < 60) {
    return `${Math.round(resolutionTime.minutes)} phút`;
  }
  return `${resolutionTime.hours} giờ`;
}

/**
 * Component chính của trang danh sách ticket dành cho quản trị viên.
 * Kết nối các hook truy vấn URL, danh sách ticket, tùy chọn bộ lọc và số liệu dashboard.
 */
function AdminTicketsPage() {
  // Quản lý tham số bộ lọc và phân trang đồng bộ trực tiếp với URL search params
  const {
    query,
    setFilter,
    setPage,
    resetFilters,
    activeFilterCount,
    hasActiveFilters,
  } = useTicketListQuery();
  // Luồng lấy dữ liệu 1: danh sách ticket phân trang từ API theo query hiện tại
  const ticketList = useTicketList(query);
  // Luồng lấy dữ liệu 2: danh sách tùy chọn cho dropdown bộ lọc (danh mục, kỹ thuật viên...)
  const filterOptions = useTicketFilterOptions();
  // Luồng lấy dữ liệu 3: chỉ số tổng quan (tổng ticket, MTTR, CSAT) từ endpoint dashboard
  const { data: dashboard } = useAdminDashboard();
  // Ổn định tham chiếu mảng tickets để tránh tính toán lại không cần thiết trong useMemo bên dưới
  const tickets = useMemo(
    () => ticketList.data?.tickets ?? [],
    [ticketList.data?.tickets],
  );
  // Tổng số bản ghi khớp điều kiện lọc (ưu tiên lấy từ metadata phân trang của backend)
  const totalItems = ticketList.data?.pagination?.totalItems ?? tickets.length;

  // Tính toán các chỉ số nhanh trên thanh Operational Stats Bar (kết hợp dữ liệu danh sách & dashboard)
  const queueMetrics = useMemo(() => {
    // Đếm các ticket mức độ khẩn cấp (urgent / P1) chưa hoàn thành trong tập ticket hiện tại
    const p1Count = tickets.filter(
      (t) =>
        t.priority === "urgent" &&
        !["resolved", "closed", "cancelled"].includes(t.status),
    ).length;
    // Đếm các ticket chưa được gán kỹ thuật viên và chưa đóng
    const unassignedCount = tickets.filter(
      (t) =>
        !t.assignedTo &&
        !["resolved", "closed", "cancelled"].includes(t.status),
    ).length;

    return {
      totalTickets: dashboard?.summary?.totalTickets ?? totalItems,
      p1Count,
      unassignedCount,
      resolutionText: formatResolutionMetric(
        dashboard?.summary?.averageResolutionTime,
      ),
      resolutionSample:
        dashboard?.summary?.averageResolutionTime?.sampleSize ?? 0,
      averageRating: dashboard?.summary?.averageRating ?? null,
      ratingCount: dashboard?.summary?.ratingCount ?? 0,
    };
  }, [dashboard?.summary, tickets, totalItems]);

  return (
    <section
      aria-labelledby="admin-ticket-list-title"
      className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6"
    >
      {/* Operational Stats Bar (5-Metric Grid from DeskPro IT) */}
      {/* Thanh 5 thẻ thống kê nhanh kèm nút lọc tức thì theo P1 và Chưa phân công */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="flex flex-col justify-between rounded-xl border border-brand-bone bg-white p-4 shadow-xs transition-colors hover:border-brand-ash">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wider text-brand-slate uppercase">
              Tổng Ticket Hệ Thống
            </span>
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-violet/10 text-brand-violet">
              <svg
                className="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                />
              </svg>
            </span>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="font-display text-2xl font-extrabold text-brand-ink">
              {queueMetrics.totalTickets}
            </span>
            <span className="inline-flex items-center text-xs font-semibold text-brand-emerald">
              Dữ liệu thực
            </span>
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-xl border border-red-200 bg-red-50/40 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wider text-red-700 uppercase">
              Nguy Cơ Quá Hạn SLA (P1)
            </span>
            <span className="pulse-sla flex h-6 w-6 items-center justify-center rounded-md bg-red-100 text-red-600">
              <svg
                className="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </span>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="font-display text-2xl font-extrabold text-red-600">
              {queueMetrics.p1Count}
            </span>
            {/* Bật/tắt nhanh bộ lọc độ ưu tiên khẩn cấp (urgent) */}
            <button
              type="button"
              onClick={() =>
                setFilter(
                  "priority",
                  query.priority === "urgent" ? "" : "urgent",
                )
              }
              className="text-xs font-semibold text-red-600 underline hover:text-red-800"
            >
              Lọc khẩn cấp →
            </button>
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-xl border border-brand-bone bg-white p-4 shadow-xs transition-colors hover:border-brand-ash">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wider text-brand-slate uppercase">
              Chưa Phân Công
            </span>
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-amber-100 text-amber-600">
              <svg
                className="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
                />
              </svg>
            </span>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="font-display text-2xl font-extrabold text-brand-ink">
              {queueMetrics.unassignedCount}
            </span>
            {/* Bật/tắt nhanh bộ lọc trạng thái đang chờ phân công (pending) */}
            <button
              type="button"
              onClick={() =>
                setFilter(
                  "status",
                  query.status === "pending" ? "" : "pending",
                )
              }
              className="text-xs font-semibold text-brand-violet hover:underline"
            >
              Lọc chờ gán →
            </button>
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-xl border border-brand-bone bg-white p-4 shadow-xs transition-colors hover:border-brand-ash">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wider text-brand-slate uppercase">
              Thời Gian Xử Lý TB
            </span>
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-blue/10 text-brand-blue">
              <svg
                className="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
            </span>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="font-display text-2xl font-extrabold text-brand-ink">
              {queueMetrics.resolutionText}
            </span>
            <span className="text-xs font-medium text-brand-slate">
              {queueMetrics.resolutionSample} đã xong
            </span>
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-xl border border-brand-bone bg-white p-4 shadow-xs transition-colors hover:border-brand-ash">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wider text-brand-slate uppercase">
              Hài Lòng (CSAT)
            </span>
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-emerald/10 text-brand-emerald">
              <svg
                className="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </span>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="font-display text-2xl font-extrabold text-brand-ink">
              {queueMetrics.averageRating != null
                ? `${queueMetrics.averageRating}/5`
                : "Chưa có"}
            </span>
            <Link
              to="/admin/reports"
              className="text-xs font-semibold text-brand-violet hover:underline"
            >
              {queueMetrics.ratingCount} đánh giá →
            </Link>
          </div>
        </div>
      </div>

      {/* Tiêu đề ẩn hỗ trợ trình đọc màn hình (accessibility) */}
      <h1 id="admin-ticket-list-title" className="sr-only">
        Hàng Đợi Ticket IT Help Desk
      </h1>

      {/* Thanh bộ lọc ticket đa tiêu chí */}
      <TicketFilters
        query={query}
        filterOptions={filterOptions.data}
        optionsError={filterOptions.error}
        optionsLoading={filterOptions.isLoading}
        activeFilterCount={activeFilterCount}
        hasActiveFilters={hasActiveFilters}
        onFilterChange={setFilter}
        onReset={resetFilters}
        onRetryOptions={filterOptions.refetch}
      />

      {/* Vùng hiển thị danh sách ticket theo các trạng thái: loading, lỗi, có dữ liệu hoặc trống */}
      <div className="mt-4" aria-busy={ticketList.isLoading}>
        {ticketList.isLoading ? <TicketListSkeleton /> : null}

        {!ticketList.isLoading && ticketList.error ? (
          <TicketListErrorState
            message={getTicketListErrorMessage(ticketList.error)}
            onRetry={ticketList.refetch}
          />
        ) : null}

        {!ticketList.isLoading && ticketList.data ? (
          ticketList.data.tickets.length > 0 ? (
            <div className="overflow-hidden rounded-xl border border-brand-bone bg-white shadow-xs">
              <TicketList
                tickets={ticketList.data.tickets}
                onRefresh={ticketList.refetch}
              />
              <TicketPagination
                pagination={ticketList.data.pagination}
                onPageChange={setPage}
              />
            </div>
          ) : (
            <TicketListEmptyState
              hasActiveFilters={hasActiveFilters || query.page > 1}
              onReset={resetFilters}
            />
          )
        ) : null}
      </div>
    </section>
  );
}

export default AdminTicketsPage;
