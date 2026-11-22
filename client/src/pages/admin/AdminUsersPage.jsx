import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
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
import {
  createAdminUser,
  deleteAdminUser,
  getAdminErrorMessage,
  getAdminUsers,
  updateAdminUser,
  updateAdminUserStatus,
} from "../../services/adminService.js";
import { normalizeSearch } from "../../utils/adminUserFormatters.js";

const EMPTY_FILTERS = { search: "", status: "", role: "" };

function AdminUsersPage() {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [openMenuId, setOpenMenuId] = useState(null);
  const [formUser, setFormUser] = useState(undefined);
  const [formOpen, setFormOpen] = useState(false);
  const [detailUser, setDetailUser] = useState(null);
  const [deleteUser, setDeleteUser] = useState(null);
  const [deleteError, setDeleteError] = useState(null);

  const {
    data: users = [],
    isLoading,
    error: listError,
  } = useQuery({
    queryKey: ["admin", "users"],
    queryFn: ({ signal }) => getAdminUsers({ signal }),
  });

  useEffect(() => {
    if (listError) {
      toast.error(getAdminErrorMessage(listError));
    }
  }, [listError]);

  function invalidateUsers() {
    queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
    queryClient.invalidateQueries({ queryKey: ["technicians"] });
    queryClient.invalidateQueries({ queryKey: ["tickets", "filter-options"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  }

  const saveMutation = useMutation({
    mutationFn: ({ id, values }) =>
      id ? updateAdminUser(id, values) : createAdminUser(values),
    onSuccess: (_saved, variables) => {
      invalidateUsers();
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
      setDeleteError({
        message: getAdminErrorMessage(error),
        details: error.response?.data?.details ?? [],
      });
    },
  });

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

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const visibleUsers = filteredUsers.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize,
  );

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

  const closeForm = useCallback(() => setFormOpen(false), []);
  const closeDetail = useCallback(() => setDetailUser(null), []);

  function updateFilter(name, value) {
    setFilters((current) => ({ ...current, [name]: value }));
    setPage(1);
    setSelectedIds(new Set());
  }

  function saveUser(values) {
    return saveMutation.mutateAsync({ id: formUser?.id, values });
  }

  function toggleLock(user) {
    const nextStatus = user.status === "locked" ? "active" : "locked";
    toggleStatusMutation.mutate({ id: user.id, nextStatus });
  }

  function confirmDelete() {
    if (!deleteUser) return;
    setDeleteError(null);
    deleteMutation.mutate(deleteUser.id);
  }

  return (
    <section aria-labelledby="admin-users-title">
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

      <UserStatsGrid stats={stats} />
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

      {formOpen ? (
        <UserFormModal
          key={formUser?.id ?? "new"}
          user={formUser}
          users={users}
          onClose={closeForm}
          onSave={saveUser}
        />
      ) : null}
      {detailUser ? (
        <UserDetailDrawer
          user={
            users.find((user) => user.id === detailUser.id) ?? detailUser
          }
          onClose={closeDetail}
        />
      ) : null}
      {deleteUser ? (
        <ConfirmActionModal
          title="Xóa tài khoản người dùng?"
          description={`Tài khoản ${deleteUser.fullName} sẽ bị xóa vĩnh viễn khỏi hệ thống.`}
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
    </section>
  );
}

export default AdminUsersPage;
