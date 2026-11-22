/**
 * Thanh công cụ tìm kiếm và lọc danh sách người dùng trong trang quản trị User.
 * Cho phép lọc theo từ khóa (tên, email, số điện thoại), trạng thái tài khoản và vai trò.
 *
 * Props:
 * - filters: Object chứa giá trị lọc hiện tại ({ search, status, role }).
 * - onChange: Callback(field, value) cập nhật từng trường lọc khi người dùng thay đổi.
 * - onReset: Callback đặt lại toàn bộ bộ lọc về mặc định.
 */
import { RotateCcw, Search } from "lucide-react";
import { Button } from "../../ui/button.jsx";
import { Input } from "../../ui/input.jsx";

// Class CSS dùng chung cho các thẻ select trạng thái và vai trò
const selectClasses =
  "min-h-10 w-full rounded-lg border border-brand-bone bg-white px-3.5 text-sm text-brand-ink outline-none transition focus:border-brand-violet focus:ring-2 focus:ring-brand-violet/20";

/**
 * Component thanh bộ lọc danh sách người dùng.
 */
function UserFilters({ filters, onChange, onReset }) {
  // Kiểm tra xem có bất kỳ bộ lọc nào đang được áp dụng hay không để bật/tắt nút làm mới
  const hasFilters = Boolean(filters.search || filters.status || filters.role);

  return (
    <section
      className="rounded-xl border border-brand-bone bg-white p-4 shadow-sm"
      aria-label="Bộ lọc người dùng"
    >
      <div className="grid gap-3 lg:grid-cols-[minmax(18rem,1fr)_13rem_13rem_auto]">
        {/* Ô tìm kiếm theo tên, email hoặc số điện thoại */}
        <label className="relative block">
          <span className="sr-only">Tìm kiếm người dùng</span>
          <Search
            className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={filters.search}
            onChange={(event) => onChange("search", event.target.value)}
            placeholder="Tìm theo tên, email hoặc số điện thoại..."
            className="min-h-10 pl-10"
          />
        </label>

        {/* Bộ lọc trạng thái tài khoản */}
        <label>
          <span className="sr-only">Lọc theo trạng thái</span>
          <select
            value={filters.status}
            onChange={(event) => onChange("status", event.target.value)}
            className={selectClasses}
          >
            <option value="">Tất cả trạng thái</option>
            <option value="active">Đang hoạt động</option>
            <option value="locked">Bị khóa</option>
          </select>
        </label>

        {/* Bộ lọc vai trò người dùng */}
        <label>
          <span className="sr-only">Lọc theo vai trò</span>
          <select
            value={filters.role}
            onChange={(event) => onChange("role", event.target.value)}
            className={selectClasses}
          >
            <option value="">Tất cả vai trò</option>
            <option value="user">Người dùng</option>
            <option value="technician">Kỹ thuật viên</option>
            <option value="admin">Quản trị viên</option>
          </select>
        </label>

        {/* Nút xóa bộ lọc, bị vô hiệu hóa khi chưa chọn điều kiện lọc nào */}
        <Button
          type="button"
          variant="outline"
          onClick={onReset}
          disabled={!hasFilters}
          className="min-h-10"
        >
          <RotateCcw className="size-4" aria-hidden="true" />
          Làm mới bộ lọc
        </Button>
      </div>
    </section>
  );
}

export default UserFilters;
