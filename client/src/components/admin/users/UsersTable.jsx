/**
 * Bảng hiển thị danh sách người dùng có hỗ trợ chọn nhiều dòng, menu thao tác theo dòng và phân trang trong module quản trị User.
 * Tự động chuyển đổi giữa dạng thẻ danh sách trên thiết bị nhỏ (mobile) và bảng đầy đủ trên màn hình lớn (desktop).
 *
 * Props:
 * - users: Mảng danh sách người dùng trên trang hiện tại.
 * - total: Tổng số bản ghi người dùng sau khi lọc.
 * - page: Số trang hiện tại (bắt đầu từ 1).
 * - pageSize: Số lượng dòng hiển thị trên mỗi trang.
 * - selectedIds: Set chứa các id người dùng đang được tích chọn.
 * - openMenuId: Chuỗi định danh menu thao tác đang mở (dạng `${scope}:${user.id}`).
 * - onSelect: Callback(userId) bật/tắt chọn một người dùng.
 * - onSelectPage: Callback(checked) chọn hoặc bỏ chọn tất cả người dùng trên trang hiện tại.
 * - onMenuToggle: Callback(menuId) mở/đóng menu thao tác của một dòng.
 * - onMenuClose: Callback đóng menu thao tác đang mở.
 * - onView: Callback(user) xem chi tiết người dùng.
 * - onEdit: Callback(user) mở form chỉnh sửa người dùng.
 * - onToggleLock: Callback(user) khóa hoặc mở khóa tài khoản.
 * - onDelete: Callback(user) xóa người dùng.
 * - onPageChange: Callback(nextPage) chuyển trang.
 * - onPageSizeChange: Callback(nextSize) thay đổi số dòng mỗi trang.
 */
import { ChevronLeft, ChevronRight, Edit3, Eye, LockKeyhole, MoreHorizontal, Trash2, UnlockKeyhole, UserRoundX } from "lucide-react";
import { useRef } from "react";
import useClickOutside from "../../../hooks/useClickOutside.js";
import { USER_ROLE, USER_STATUS } from "../../../data/adminUsers.js";
import { formatUserDate, getInitials } from "../../../utils/adminUserFormatters.js";
import { Badge } from "../../ui/badge.jsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../ui/table.jsx";

/**
 * Hiển thị badge trạng thái hoạt động của tài khoản (đang hoạt động, bị khóa, chưa xác thực).
 */
function StatusBadge({ status }) {
  // Tra cấu hình nhãn/màu sắc theo status, mặc định về unverified nếu không khớp
  const config = USER_STATUS[status] ?? USER_STATUS.unverified;
  return (
    <Badge
      variant={status === "active" ? "emerald" : status === "locked" ? "destructive" : "amber"}
      className={config.classes}
    >
      {config.label}
    </Badge>
  );
}

/**
 * Hiển thị badge vai trò của người dùng (Quản trị viên, Kỹ thuật viên, Người dùng).
 */
function RoleBadge({ role }) {
  // Tra cấu hình nhãn/màu sắc theo role, mặc định về user nếu không khớp
  const config = USER_ROLE[role] ?? USER_ROLE.user;
  return (
    <Badge
      variant={role === "admin" ? "blue" : role === "technician" ? "violet" : "secondary"}
      className={`rounded-md ${config.classes}`}
    >
      {config.label}
    </Badge>
  );
}

/**
 * Khối hiển thị avatar viết tắt, họ tên và email của người dùng; cho phép bấm để mở chi tiết.
 */
function UserIdentity({ user, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full min-w-0 items-center gap-3 text-left"
      title={`Xem chi tiết ${user.fullName}`}
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700 transition group-hover:bg-blue-200" aria-hidden="true">{getInitials(user.fullName)}</span>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-slate-900 transition group-hover:text-brand-violet">{user.fullName}</p>
        <p className="truncate text-xs text-slate-500">{user.email}</p>
      </div>
    </button>
  );
}

/**
 * Menu thả xuống chứa các hành động quản trị cho từng người dùng (xem, sửa, khóa/mở khóa, xóa).
 * Sử dụng hook useClickOutside để tự động đóng menu khi người dùng click ra ngoài vùng menu.
 */
function UserActionMenu({ user, open, openUpward = false, onToggle, onClose, onView, onEdit, onToggleLock, onDelete }) {
  // Ref bọc nút kích hoạt và dropdown menu để phát hiện click bên ngoài
  const menuRef = useRef(null);
  useClickOutside(menuRef, onClose, open);
  // Chọn icon phù hợp với trạng thái khóa hiện tại của tài khoản
  const ActionIcon = user.status === "locked" ? UnlockKeyhole : LockKeyhole;

  return (
    <div ref={menuRef} className="relative inline-flex">
      <button type="button" onClick={onToggle} className="flex size-10 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-2 focus-visible:outline-blue-600" aria-label={`Thao tác với ${user.fullName}`} aria-expanded={open}>
        <MoreHorizontal className="size-5" aria-hidden="true" />
      </button>
      {open ? (
        <div
          className={`absolute right-0 z-30 w-56 rounded-xl border border-slate-200 bg-white p-1.5 text-left shadow-xl ${
            openUpward ? "bottom-11" : "top-11"
          }`}
          role="menu"
        >
          <button type="button" onClick={onView} className="flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-sm text-slate-700 hover:bg-slate-50" role="menuitem"><Eye className="size-4" />Xem chi tiết</button>
          <button type="button" onClick={onEdit} className="flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-sm text-slate-700 hover:bg-slate-50" role="menuitem"><Edit3 className="size-4" />Chỉnh sửa</button>
          <button type="button" onClick={onToggleLock} className="flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-sm text-slate-700 hover:bg-slate-50" role="menuitem"><ActionIcon className="size-4" />{user.status === "locked" ? "Mở khóa tài khoản" : "Khóa tài khoản"}</button>
          <div className="my-1 border-t border-slate-100" />
          <button type="button" onClick={onDelete} className="flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-sm text-red-700 hover:bg-red-50" role="menuitem"><Trash2 className="size-4" />Xóa tài khoản</button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Thanh phân trang và chọn số dòng hiển thị cho danh sách người dùng.
 */
function Pagination({ page, pageSize, total, onPageChange, onPageSizeChange }) {
  // Tính tổng số trang (tối thiểu 1 trang) và khoảng thứ tự bản ghi đang hiển thị
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const first = total ? (page - 1) * pageSize + 1 : 0;
  const last = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-col gap-4 border-t border-slate-200 px-4 py-4 lg:flex-row lg:items-center lg:justify-between lg:px-5">
      <p className="text-sm text-slate-600">Hiển thị <strong className="text-slate-800">{first}–{last}</strong> trong tổng số <strong className="text-slate-800">{total}</strong> bản ghi</p>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        {/* Dropdown thay đổi số dòng mỗi trang */}
        <label className="flex items-center gap-2 text-sm text-slate-600">
          Số dòng
          <select value={pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value))} className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-3 focus:ring-blue-100">
            {[5, 10, 20].map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        {/* Cụm nút điều hướng trang trước / số trang / trang sau */}
        <nav className="flex items-center gap-1" aria-label="Phân trang người dùng">
          <button type="button" onClick={() => onPageChange(page - 1)} disabled={page === 1} className="flex size-10 items-center justify-center rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:opacity-40" aria-label="Trang trước"><ChevronLeft className="size-4" /></button>
          {Array.from({ length: totalPages }, (_, index) => index + 1).map((item) => (
            <button key={item} type="button" onClick={() => onPageChange(item)} aria-current={item === page ? "page" : undefined} className={`size-10 rounded-lg text-sm font-semibold ${item === page ? "bg-[#2563EB] text-white" : "text-slate-600 hover:bg-slate-100"}`}>{item}</button>
          ))}
          <button type="button" onClick={() => onPageChange(page + 1)} disabled={page === totalPages} className="flex size-10 items-center justify-center rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:opacity-40" aria-label="Trang sau"><ChevronRight className="size-4" /></button>
        </nav>
      </div>
    </div>
  );
}

/**
 * Component bảng quản lý người dùng chính.
 */
function UsersTable({ users, total, page, pageSize, selectedIds, openMenuId, onSelect, onSelectPage, onMenuToggle, onMenuClose, onView, onEdit, onToggleLock, onDelete, onPageChange, onPageSizeChange }) {
  // Kiểm tra toàn bộ bản ghi trên trang hiện tại có đang được chọn hết hay không
  const allSelected = users.length > 0 && users.every((user) => selectedIds.has(user.id));

  // Helper tạo props truyền cho UserActionMenu theo ngữ cảnh mobile/desktop và vị trí dòng
  const menuProps = (user, scope, index) => ({
    user,
    open: openMenuId === `${scope}:${user.id}`,
    // Ở bảng desktop, 2 dòng cuối mở menu hướng lên trên để tránh bị tràn/khuất khỏi bảng
    openUpward: scope === "desktop" && users.length > 2 && index >= users.length - 2,
    onToggle: () => onMenuToggle(`${scope}:${user.id}`),
    onClose: onMenuClose,
    onView: () => onView(user),
    onEdit: () => onEdit(user),
    onToggleLock: () => onToggleLock(user),
    onDelete: () => onDelete(user),
  });

  return (
    <section className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-white shadow-sm" aria-labelledby="users-table-title">
      <h2 id="users-table-title" className="sr-only">Danh sách người dùng</h2>
      {users.length === 0 ? (
        /* Trạng thái rỗng khi không có người dùng nào khớp bộ lọc */
        <div className="flex min-h-72 flex-col items-center justify-center px-5 text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-slate-100 text-slate-500"><UserRoundX className="size-6" /></span>
          <h3 className="mt-4 font-semibold text-slate-900">Không tìm thấy người dùng</h3>
          <p className="mt-1 max-w-sm text-sm text-slate-500">Hãy thay đổi từ khóa hoặc bộ lọc để xem kết quả khác.</p>
        </div>
      ) : (
        <>
          {/* Giao diện danh sách thẻ cho màn hình nhỏ (mobile/tablet) */}
          <ul className="divide-y divide-slate-100 lg:hidden">
            {users.map((user, index) => (
              <li key={user.id} className="p-4">
                <div className="flex items-start gap-3">
                  <input type="checkbox" checked={selectedIds.has(user.id)} onChange={() => onSelect(user.id)} className="mt-3 size-4 rounded border-slate-300 accent-blue-600" aria-label={`Chọn ${user.fullName}`} />
                  <div className="min-w-0 flex-1"><UserIdentity user={user} onClick={() => onView(user)} /></div>
                  <UserActionMenu {...menuProps(user, "mobile", index)} />
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
                  <div><dt className="text-slate-500">Số điện thoại</dt><dd className="mt-1 font-medium text-slate-700">{user.phone}</dd></div>
                  <div><dt className="text-slate-500">Số yêu cầu</dt><dd className="mt-1 font-semibold text-slate-800">{user.ticketCount}</dd></div>
                  <div><dt className="text-slate-500">Vai trò</dt><dd className="mt-1"><RoleBadge role={user.role} /></dd></div>
                  <div><dt className="text-slate-500">Trạng thái</dt><dd className="mt-1"><StatusBadge status={user.status} /></dd></div>
                  <div className="col-span-2"><dt className="text-slate-500">Ngày tạo</dt><dd className="mt-1 font-medium text-slate-700">{formatUserDate(user.createdAt)}</dd></div>
                </dl>
              </li>
            ))}
          </ul>

          {/* Giao diện bảng đầy đủ cho màn hình desktop */}
          <div className="hidden lg:block">
            <Table className="min-w-[72rem]">
              <TableHeader className="bg-slate-50 text-xs text-slate-500">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-14 px-5 py-3">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={(event) => onSelectPage(event.target.checked)}
                      className="size-4 rounded border-slate-300 accent-blue-600"
                      aria-label="Chọn tất cả người dùng trên trang"
                    />
                  </TableHead>
                  <TableHead className="px-3 py-3">Người dùng</TableHead>
                  <TableHead className="px-3 py-3">Số điện thoại</TableHead>
                  <TableHead className="px-3 py-3">Vai trò</TableHead>
                  <TableHead className="px-3 py-3 text-center">Số yêu cầu</TableHead>
                  <TableHead className="px-3 py-3">Trạng thái</TableHead>
                  <TableHead className="px-3 py-3">Ngày tạo</TableHead>
                  <TableHead className="px-5 py-3 text-right">Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-slate-100">
                {users.map((user, index) => (
                  <TableRow key={user.id} className="hover:bg-blue-50/40">
                    <TableCell className="px-5 py-4">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(user.id)}
                        onChange={() => onSelect(user.id)}
                        className="size-4 rounded border-slate-300 accent-blue-600"
                        aria-label={`Chọn ${user.fullName}`}
                      />
                    </TableCell>
                    <TableCell className="max-w-64 px-3 py-4">
                      <UserIdentity user={user} onClick={() => onView(user)} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap px-3 py-4 text-sm text-slate-600">
                      {user.phone || "—"}
                    </TableCell>
                    <TableCell className="px-3 py-4">
                      <RoleBadge role={user.role} />
                    </TableCell>
                    <TableCell className="px-3 py-4 text-center text-sm font-semibold text-slate-800">
                      {user.ticketCount}
                    </TableCell>
                    <TableCell className="px-3 py-4">
                      <StatusBadge status={user.status} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap px-3 py-4 text-sm text-slate-600">
                      <time dateTime={user.createdAt}>
                        {formatUserDate(user.createdAt)}
                      </time>
                    </TableCell>
                    <TableCell className="px-5 py-4 text-right">
                      <UserActionMenu {...menuProps(user, "desktop", index)} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
      {/* Thanh điều khiển phân trang đặt ở cuối khung bảng */}
      <Pagination page={page} pageSize={pageSize} total={total} onPageChange={onPageChange} onPageSizeChange={onPageSizeChange} />
    </section>
  );
}

export default UsersTable;
