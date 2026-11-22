/**
 * TicketListErrorState.jsx
 *
 * Chức năng: Hiển thị giao diện thông báo lỗi khi quá trình tải danh sách ticket thất bại.
 * Props:
 * - `message` (string): Thông báo lỗi thân thiện đã được chuẩn hóa từ service để hiển thị cho người dùng.
 * - `onRetry` (function): Callback kích hoạt gọi lại API tải danh sách ticket.
 * Vai trò: Ngăn trang danh sách ticket bị trắng hoặc treo khi có lỗi mạng/server,
 * cung cấp vùng thông báo chuẩn accessibility (`role="alert"`) và nút thử lại ngay lập tức.
 */
import { RefreshCw, TriangleAlert } from "lucide-react";

// Component hiển thị khối cảnh báo lỗi tải danh sách ticket kèm nút gọi lại API
function TicketListErrorState({ message, onRetry }) {
  return (
    <section
      className="flex min-h-80 items-center justify-center rounded-xl border border-red-200 bg-white p-6 text-center shadow-sm"
      role="alert"
      aria-labelledby="ticket-list-error-title"
    >
      <div className="max-w-md">
        {/* Biểu tượng cảnh báo lỗi */}
        <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-red-50 text-red-600">
          <TriangleAlert className="size-7" aria-hidden="true" />
        </span>
        <h2
          id="ticket-list-error-title"
          className="mt-4 text-base font-semibold text-slate-900"
        >
          Không thể tải danh sách ticket
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">{message}</p>
        {/* Nút thử lại giúp kích hoạt refetch danh sách mà không cần tải lại toàn bộ trang */}
        <button
          type="button"
          onClick={onRetry}
          className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
          <RefreshCw className="size-4" aria-hidden="true" />
          Thử lại
        </button>
      </div>
    </section>
  );
}

export default TicketListErrorState;
