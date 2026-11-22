import { RotateCcw, Search } from "lucide-react";
import { Button } from "../../ui/button.jsx";
import { Input } from "../../ui/input.jsx";

const selectClasses =
  "min-h-10 w-full rounded-lg border border-brand-bone bg-white px-3.5 text-sm text-brand-ink outline-none transition focus:border-brand-violet focus:ring-2 focus:ring-brand-violet/20";

function UserFilters({ filters, onChange, onReset }) {
  const hasFilters = Boolean(filters.search || filters.status || filters.role);

  return (
    <section
      className="rounded-xl border border-brand-bone bg-white p-4 shadow-sm"
      aria-label="Bộ lọc người dùng"
    >
      <div className="grid gap-3 lg:grid-cols-[minmax(18rem,1fr)_13rem_13rem_auto]">
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
