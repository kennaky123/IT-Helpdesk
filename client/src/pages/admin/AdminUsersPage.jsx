/**
 * Trang Quản lý Người dùng & Phân quyền (Admin Users).
 *
 * Vai trò trong hệ thống IT Helpdesk:
 * - Cho phép quản trị viên quản lý toàn bộ tài khoản trong hệ thống (nhân viên, kỹ thuật viên, admin):
 *   tạo mới, chỉnh sửa, xem chi tiết lịch sử hỗ trợ, khóa/mở khóa quyền truy cập và xóa tài khoản.
 * - Hỗ trợ tìm kiếm đa trường, lọc theo vai trò/trạng thái, phân trang phía client và thao tác hàng loạt
 *   (khóa, mở khóa, xóa nhiều tài khoản cùng lúc nhưng luôn bảo vệ tài khoản đang đăng nhập).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LockKeyhole, Plus, Trash2, UnlockKeyhole } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import UserDetailDrawer from "../../components/admin/users/UserDetailDrawer.jsx";
import UserFilters from "../../components/admin/users/UserFilters.jsx";
import UserFormModal from "../../components/admin/users/UserFormModal.jsx";
import UserListSkeleton from "../../components/admin/users/UserListSkeleton.jsx";
import UserStatsGrid from "../../components/admin/users/UserStatsGrid.jsx";
import UsersTable from "../../components/admin/users/UsersTable.jsx";
import ConfirmActionModal from "../../components/common/ConfirmActionModal.jsx";
import WorkspacePageHeader from "../../components/common/WorkspacePageHeader.jsx";
import { Button } from "../../components/ui/button.jsx";
import useAuth from "../../hooks/useAuth.js";
import {
  createAdminUser,
  deleteAdminUser,
  getAdminErrorMessage,
  getAdminUsers,
  updateAdminUser,
  updateAdminUserStatus,
} from "../../services/adminService.js";
import { normalizeSearch } from "../../utils/adminUserFormatters.js";

// Giá trị khởi tạo mặc định cho bộ lọc người dùng
const EMPTY_FILTERS = { search: "", status: "", role: "" };

/**
 * Component chính của trang Quản lý người dùng dành cho Admin.
 * Quản lý query/mutation người dùng, trạng thái chọn hàng loạt, bộ lọc/phân trang và các modal/drawer.
 */
function AdminUsersPage() {
  // Lấy thông tin người dùng hiện đang đăng nhập để chặn tự khóa/xóa tài khoản của chính mình
  const { user: currentUser } = useAuth();
  // Client React Query để invalidate cache các phân hệ liên quan khi dữ liệu người dùng thay đổi
  const queryClient = useQueryClient();
  // Bộ lọc tìm kiếm (từ khóa, trạng thái khóa/hoạt động, vai trò)
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  // Trang hiện tại và số bản ghi mỗi trang (phân trang phía client)
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  // Tập hợp ID các tài khoản đang được tick chọn để thao tác hàng loạt
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  // ID của dòng tài khoản đang mở menu thao tác
  const [openMenuId, setOpenMenuId] = useState(null);
  // Tài khoản đang chỉnh sửa trong UserFormModal (undefined khi tạo tài khoản mới)
  const [formUser, setFormUser] = useState(undefined);
  // Cờ đóng/mở modal tạo hoặc sửa người dùng
  const [formOpen, setFormOpen] = useState(false);
  // Tài khoản đang xem chi tiết trong UserDetailDrawer
  const [detailUser, setDetailUser] = useState(null);
  // Tài khoản đang chờ xác nhận xóa đơn lẻ
  const [deleteUser, setDeleteUser] = useState(null);
  // Thông tin lỗi chi tiết trả về từ server nếu xóa tài khoản thất bại
  const [deleteError, setDeleteError] = useState(null);
  // Cờ đóng/mở modal xác nhận xóa hàng loạt
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  // Cờ báo hiệu đang thực thi thao tác khóa/mở khóa/xóa hàng loạt
  const [bulkActionPending, setBulkActionPending] = useState(false);

  // Luồng lấy dữ liệu: truy vấn danh sách toàn bộ người dùng từ API quản trị
  const {
    data: users = [],
    isLoading,
    error: listError,
  } = useQuery({
    queryKey: ["admin", "users"],
    queryFn: ({ signal }) => getAdminUsers({ signal }),
  });

  // Hiển thị thông báo lỗi nếu quá trình tải danh sách người dùng thất bại
  useEffect(() => {
    if (listError) {
      toast.error(getAdminErrorMessage(listError));
    }
  }, [listError]);

  /**
   * Làm mới cache React Query cho danh sách người dùng và tất cả các phân hệ
   * có tham chiếu đến tài khoản (kỹ thuật viên, ticket, tài sản CMDB, bản quyền phần mềm, dashboard).
   */
  function invalidateUsers() {
    queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
    queryClient.invalidateQueries({ queryKey: ["admin", "technicians"] });
    queryClient.invalidateQueries({ queryKey: ["technicians"] });
    queryClient.invalidateQueries({ queryKey: ["tickets", "filter-options"] });
    queryClient.invalidateQueries({ queryKey: ["tickets"] });
    queryClient.invalidateQueries({ queryKey: ["assets"] });
    queryClient.invalidateQueries({ queryKey: ["software"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  }

  // Mutation tạo mới hoặc cập nhật thông tin tài khoản người dùng
  const saveMutation = useMutation({
    mutationFn: ({ id, values }) =>
      id ? updateAdminUser(id, values) : createAdminUser(values),
    onSuccess: (_saved, variables) => {
      invalidateUsers();
      // Khi thêm người dùng mới thì quay về trang 1 để dễ thấy bản ghi vừa tạo
      if (!variables.id) setPage(1);
      setFormOpen(false);
      toast.success(
        variables.id
          ? "Đã cập nhật thông tin người dùng."
          : "Đã thêm người dùng mới.",
      );
    },
    onError: (error) => {
      toast.error(getAdminErrorMessage(error));
    },
  });

  // Mutation khóa hoặc mở khóa một tài khoản người dùng
  const toggleStatusMutation = useMutation({
    mutationFn: ({ id, nextStatus }) => updateAdminUserStatus(id, nextStatus),
    onSuccess: (_saved, variables) => {
      invalidateUsers();
      setOpenMenuId(null);
      toast.success(
        variables.nextStatus === "locked"
          ? "Đã khóa tài khoản."
          : "Đã mở khóa tài khoản.",
      );
    },
    onError: (error) => {
      toast.error(getAdminErrorMessage(error));
    },
  });

  // Mutation xóa một tài khoản người dùng và dọn dẹp các state chọn/xem chi tiết liên quan
  const deleteMutation = useMutation({
    mutationFn: (id) => deleteAdminUser(id),
    onSuccess: (_res, deletedId) => {
      invalidateUsers();
      setSelectedIds((current) => {
        const next = new Set(current);
        next.delete(deletedId);
        return next;
      });
      if (detailUser?.id === deletedId) setDetailUser(null);
      setDeleteUser(null);
      setDeleteError(null);
      toast.success("Đã xóa tài khoản khỏi hệ thống.");
    },
    onError: (error) => {
      // Lưu thông điệp và chi tiết lỗi từ server để hiển thị trực tiếp trong modal xác nhận xóa
      setDeleteError({
        message: getAdminErrorMessage(error),
        details: error.response?.data?.details ?? [],
      });
    },
  });

  // Lọc danh sách người dùng theo từ khóa (họ tên, email, số điện thoại), trạng thái và vai trò
  const filteredUsers = useMemo(() => {
    const keyword = normalizeSearch(filters.search);
    return users.filter((user) => {
      const searchable = normalizeSearch(
        `${user.fullName} ${user.email} ${user.phone}`,
      );
      return (
        (!keyword || searchable.includes(keyword)) &&
        (!filters.status || user.status === filters.status) &&
        (!filters.role || user.role === filters.role)
      );
    });
  }, [filters, users]);

  // Tính tổng số trang, chuẩn hóa số trang hợp lệ và cắt danh sách người dùng hiển thị ở trang hiện tại
  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const visibleUsers = filteredUsers.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize,
  );

  // Tính toán các chỉ số thống kê nhân sự hiển thị trên UserStatsGrid
  const stats = useMemo(() => {
    const now = new Date();
    return {
      total: users.length,
      active: users.filter((user) => user.status === "active").length,
      locked: users.filter((user) => user.status === "locked").length,
      newThisMonth: users.filter((user) => {
        const date = new Date(user.createdAt);
        return (
          date.getMonth() === now.getMonth() &&
          date.getFullYear() === now.getFullYear()
        );
      }).length,
    };
  }, [users]);

  // Callback ổn định reference để đóng modal form và drawer chi tiết
  const closeForm = useCallback(() => setFormOpen(false), []);
  const closeDetail = useCallback(() => setDetailUser(null), []);

  /**
   * Cập nhật một trường bộ lọc, đồng thời đưa phân trang về trang 1 và xóa danh sách đang tick chọn.
   */
  function updateFilter(name, value) {
    setFilters((current) => ({ ...current, [name]: value }));
    setPage(1);
    setSelectedIds(new Set());
  }

  /**
   * Thực thi saveMutation dạng promise để modal form chờ phản hồi trước khi đóng.
   */
  function saveUser(values) {
    return saveMutation.mutateAsync({ id: formUser?.id, values });
  }

  /**
   * Đảo trạng thái khóa/mở khóa của một người dùng thông qua toggleStatusMutation.
   */
  function toggleLock(user) {
    const nextStatus = user.status === "locked" ? "active" : "locked";
    toggleStatusMutation.mutate({ id: user.id, nextStatus });
  }

  /**
   * Xóa lỗi cũ (nếu có) và kích hoạt mutation xóa tài khoản đang chọn.
   */
  function confirmDelete() {
    if (!deleteUser) return;
    setDeleteError(null);
    deleteMutation.mutate(deleteUser.id);
  }

  /**
   * Khóa hoặc mở khóa hàng loạt các tài khoản đang được chọn.
   * Luôn loại trừ tài khoản hiện tại của chính admin nếu thao tác là khóa, dùng Promise.allSettled để thống kê kết quả.
   */
  async function handleBulkLockStatus(nextStatus) {
    const targetIds = Array.from(selectedIds).filter(
      (id) => !(nextStatus === "locked" && id === currentUser?._id),
    );

    if (targetIds.length === 0) {
      toast.warning("Không thể tự khóa tài khoản đang đăng nhập.");
      return;
    }

    setBulkActionPending(true);
    try {
      const results = await Promise.allSettled(
        targetIds.map((id) => updateAdminUserStatus(id, nextStatus)),
      );
      const succeeded = results.filter((item) => item.status === "fulfilled").length;
      const failed = results.length - succeeded;
      invalidateUsers();
      setSelectedIds(new Set());

      if (succeeded > 0) {
        toast.success(
          nextStatus === "locked"
            ? `Đã khóa ${succeeded} tài khoản.`
            : `Đã mở khóa ${succeeded} tài khoản.`,
        );
      }
      if (failed > 0) {
        toast.error(`Có ${failed} tài khoản cập nhật trạng thái thất bại.`);
      }
    } finally {
      setBulkActionPending(false);
    }
  }

  /**
   * Xóa hàng loạt các tài khoản đang được chọn (trừ tài khoản đang đăng nhập),
   * đóng drawer chi tiết nếu tài khoản đang xem nằm trong danh sách bị xóa và làm mới cache.
   */
  async function handleBulkDeleteConfirm() {
    const targetIds = Array.from(selectedIds).filter(
      (id) => id !== currentUser?._id,
    );

    if (targetIds.length === 0) {
      setBulkDeleteOpen(false);
      toast.warning("Không thể tự xóa tài khoản đang đăng nhập.");
      return;
    }

    setBulkActionPending(true);
    try {
      const results = await Promise.allSettled(
        targetIds.map((id) => deleteAdminUser(id)),
      );
      const succeeded = results.filter((item) => item.status === "fulfilled").length;
      const failed = results.length - succeeded;
      invalidateUsers();
      setSelectedIds(new Set());
      setBulkDeleteOpen(false);

      if (detailUser && targetIds.includes(detailUser.id)) {
        setDetailUser(null);
      }
      if (succeeded > 0) {
        toast.success(`Đã xóa ${succeeded} tài khoản khỏi hệ thống.`);
      }
      if (failed > 0) {
        toast.error(`Có ${failed} tài khoản xóa thất bại.`);
      }
    } finally {
      setBulkActionPending(false);
    }
  }

  return (
    <section aria-labelledby="admin-users-title">
      {/* Tiêu đề trang và nút mở modal thêm mới người dùng */}
      <WorkspacePageHeader
        eyebrow="Quản trị nhân sự & phân quyền"
        title="Quản lý người dùng"
        description="Quản lý tài khoản nhân viên, kỹ thuật viên, trạng thái truy cập và lịch sử gửi yêu cầu hỗ trợ."
        actions={
          <Button
            type="button"
            size="pill"
            onClick={() => {
              setFormUser(undefined);
              setFormOpen(true);
            }}
          >
            <Plus className="size-4" aria-hidden="true" />
            Thêm người dùng
          </Button>
        }
      />

      {/* Lưới thẻ thống kê tổng số tài khoản, đang hoạt động, bị khóa và mới trong tháng */}
      <UserStatsGrid stats={stats} />

      {/* Thanh bộ lọc tìm kiếm theo từ khóa, trạng thái và vai trò */}
      <div className="mt-6">
        <UserFilters
          filters={filters}
          onChange={updateFilter}
          onReset={() => {
            setFilters(EMPTY_FILTERS);
            setPage(1);
            setSelectedIds(new Set());
          }}
        />
      </div>

      {/* Thanh công cụ thao tác hàng loạt xuất hiện khi có ít nhất 1 tài khoản được chọn */}
      {selectedIds.size > 0 ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-purple-200 bg-purple-50/70 px-4 py-3">
          <p className="text-xs font-semibold text-brand-onyx">
            Đã chọn <span className="font-bold text-brand-violet">{selectedIds.size}</span> tài khoản
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={bulkActionPending}
              onClick={() => handleBulkLockStatus("locked")}
            >
              <LockKeyhole className="size-3.5" aria-hidden="true" />
              Khóa đã chọn
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={bulkActionPending}
              onClick={() => handleBulkLockStatus("active")}
            >
              <UnlockKeyhole className="size-3.5" aria-hidden="true" />
              Mở khóa đã chọn
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={bulkActionPending}
              onClick={() => setBulkDeleteOpen(true)}
            >
              <Trash2 className="size-3.5" aria-hidden="true" />
              Xóa đã chọn
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={bulkActionPending}
              onClick={() => setSelectedIds(new Set())}
            >
              Bỏ chọn
            </Button>
          </div>
        </div>
      ) : null}

      {/* Vùng hiển thị bảng danh sách người dùng hoặc skeleton khi đang tải */}
      <div className="mt-4" aria-busy={isLoading}>
        {isLoading ? (
          <UserListSkeleton />
        ) : (
          <UsersTable
            users={visibleUsers}
            total={filteredUsers.length}
            page={safePage}
            pageSize={pageSize}
            selectedIds={selectedIds}
            openMenuId={openMenuId}
            onSelect={(id) =>
              setSelectedIds((current) => {
                const next = new Set(current);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return next;
              })
            }
            onSelectPage={(checked) =>
              setSelectedIds((current) => {
                const next = new Set(current);
                visibleUsers.forEach((user) =>
                  checked ? next.add(user.id) : next.delete(user.id),
                );
                return next;
              })
            }
            onMenuToggle={(id) =>
              setOpenMenuId((current) => (current === id ? null : id))
            }
            onMenuClose={() => setOpenMenuId(null)}
            onView={(user) => {
              setOpenMenuId(null);
              setDetailUser(user);
            }}
            onEdit={(user) => {
              setOpenMenuId(null);
              setFormUser(user);
              setFormOpen(true);
            }}
            onToggleLock={toggleLock}
            onDelete={(user) => {
              setOpenMenuId(null);
              setDeleteUser(user);
            }}
            onPageChange={setPage}
            onPageSizeChange={(value) => {
              setPageSize(value);
              setPage(1);
            }}
          />
        )}
      </div>

      {/* Modal thêm mới hoặc chỉnh sửa người dùng */}
      {formOpen ? (
        <UserFormModal
          key={formUser?.id ?? "new"}
          user={formUser}
          users={users}
          onClose={closeForm}
          onSave={saveUser}
        />
      ) : null}
      {/* Drawer xem chi tiết hồ sơ và lịch sử yêu cầu của người dùng */}
      {detailUser ? (
        <UserDetailDrawer
          user={
            users.find((user) => user.id === detailUser.id) ?? detailUser
          }
          onClose={closeDetail}
          onEdit={(target) => {
            setDetailUser(null);
            setFormUser(target);
            setFormOpen(true);
          }}
          onToggleLock={toggleLock}
          onDelete={(target) => {
            setDetailUser(null);
            setDeleteUser(target);
          }}
        />
      ) : null}
      {/* Modal xác nhận xóa một tài khoản người dùng */}
      {deleteUser ? (
        <ConfirmActionModal
          title="Xóa tài khoản người dùng?"
          description={`Tài khoản ${deleteUser.fullName} sẽ bị xóa vĩnh viễn và tự động thu hồi thiết bị, bản quyền, ticket liên quan.`}
          confirmLabel="Xóa tài khoản"
          submitting={deleteMutation.isPending}
          error={deleteError}
          onCancel={() => {
            setDeleteUser(null);
            setDeleteError(null);
          }}
          onConfirm={confirmDelete}
        />
      ) : null}
      {/* Modal xác nhận xóa hàng loạt các tài khoản đã chọn */}
      {bulkDeleteOpen ? (
        <ConfirmActionModal
          title={`Xóa ${selectedIds.size} tài khoản đã chọn?`}
          description="Các tài khoản đã chọn (ngoại trừ tài khoản đang đăng nhập) sẽ bị xóa vĩnh viễn và tự động thu hồi thiết bị, bản quyền, ticket liên quan."
          confirmLabel="Xóa đã chọn"
          submitting={bulkActionPending}
          onCancel={() => setBulkDeleteOpen(false)}
          onConfirm={handleBulkDeleteConfirm}
        />
      ) : null}
    </section>
  );
}

export default AdminUsersPage;
