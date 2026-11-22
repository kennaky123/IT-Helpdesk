import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CircleGauge,
  Edit3,
  MoreHorizontal,
  Plus,
  Search,
  Star,
  Trash2,
  UserCheck,
  Users,
  Wrench,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-toastify";
import TechnicianFormModal from "../../components/admin/technicians/TechnicianFormModal.jsx";
import ConfirmActionModal from "../../components/common/ConfirmActionModal.jsx";
import WorkspacePageHeader from "../../components/common/WorkspacePageHeader.jsx";
import WorkspaceStatCard from "../../components/common/WorkspaceStatCard.jsx";
import { Button } from "../../components/ui/button.jsx";
import useClickOutside from "../../hooks/useClickOutside.js";
import {
  createAdminTechnician,
  deleteAdminTechnician,
  getAdminErrorMessage,
  getAdminTechnicians,
  updateAdminTechnician,
} from "../../services/adminService.js";
import {
  getInitials,
  normalizeSearch,
} from "../../utils/adminUserFormatters.js";

const STATUS = {
  online: {
    label: "Sẵn sàng",
    classes: "bg-emerald-50 text-brand-emerald border border-emerald-200",
  },
  busy: {
    label: "Đang bận",
    classes: "bg-amber-50 text-amber-700 border border-amber-200",
  },
  offline: {
    label: "Ngoại tuyến",
    classes: "bg-brand-mist text-brand-slate border border-brand-bone",
  },
};

function TechnicianActionMenu({
  technician,
  open,
  onToggle,
  onClose,
  onEdit,
  onDelete,
}) {
  const menuRef = useRef(null);
  useClickOutside(menuRef, onClose, open);

  return (
    <div ref={menuRef} className="relative inline-flex">
      <button
        type="button"
        onClick={onToggle}
        className="flex size-8 items-center justify-center rounded-lg text-brand-slate transition hover:bg-brand-mist hover:text-brand-ink"
        aria-label={`Thao tác với ${technician.name}`}
        aria-expanded={open}
      >
        <MoreHorizontal className="size-4.5" />
      </button>
      {open ? (
        <div
          className="absolute top-9 right-0 z-30 w-44 rounded-xl border border-brand-bone bg-white p-1.5 text-left shadow-xl"
          role="menu"
        >
          <button
            type="button"
            onClick={onEdit}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-brand-ink hover:bg-brand-mist"
            role="menuitem"
          >
            <Edit3 className="size-3.5" />
            Chỉnh sửa
          </button>
          <div className="my-1 border-t border-brand-bone" />
          <button
            type="button"
            onClick={onDelete}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50"
            role="menuitem"
          >
            <Trash2 className="size-3.5" />
            Xóa kỹ thuật viên
          </button>
        </div>
      ) : null}
    </div>
  );
}

function AdminTechniciansPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [formTechnician, setFormTechnician] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [deleteTechnician, setDeleteTechnician] = useState(null);
  const [openMenuId, setOpenMenuId] = useState(null);

  const { data: technicians = [], error: listError } = useQuery({
    queryKey: ["admin", "technicians"],
    queryFn: ({ signal }) => getAdminTechnicians({ signal }),
  });

  useEffect(() => {
    if (listError) {
      toast.error(getAdminErrorMessage(listError));
    }
  }, [listError]);

  function invalidateTechnicians() {
    queryClient.invalidateQueries({ queryKey: ["admin", "technicians"] });
    queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
    queryClient.invalidateQueries({ queryKey: ["technicians"] });
    queryClient.invalidateQueries({ queryKey: ["tickets", "filter-options"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  }

  const saveMutation = useMutation({
    mutationFn: ({ id, values }) =>
      id ? updateAdminTechnician(id, values) : createAdminTechnician(values),
    onSuccess: (_saved, variables) => {
      invalidateTechnicians();
      setFormOpen(false);
      toast.success(
        variables.id
          ? "Đã cập nhật thông tin kỹ thuật viên."
          : "Đã thêm kỹ thuật viên mới.",
      );
    },
    onError: (error) => {
      toast.error(getAdminErrorMessage(error));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => deleteAdminTechnician(id),
    onSuccess: () => {
      invalidateTechnicians();
      setDeleteTechnician(null);
      toast.success("Đã xóa kỹ thuật viên khỏi hệ thống.");
    },
    onError: (error) => {
      toast.error(getAdminErrorMessage(error));
    },
  });

  const availabilityMutation = useMutation({
    mutationFn: ({ technician, nextStatus }) =>
      updateAdminTechnician(technician.id, { ...technician, status: nextStatus }),
    onSuccess: (_saved, variables) => {
      invalidateTechnicians();
      toast.success(
        variables.nextStatus === "online"
          ? "Kỹ thuật viên đã sẵn sàng nhận ticket."
          : "Đã đặt kỹ thuật viên ở trạng thái ngoại tuyến.",
      );
    },
    onError: (error) => {
      toast.error(getAdminErrorMessage(error));
    },
  });

  const filtered = useMemo(
    () =>
      technicians.filter(
        (item) =>
          (!search ||
            normalizeSearch(
              `${item.name} ${item.email} ${item.specialization}`,
            ).includes(normalizeSearch(search))) &&
          (!status || item.status === status),
      ),
    [search, status, technicians],
  );

  const createdTicketCount = technicians.reduce(
    (sum, item) => sum + item.completed,
    0,
  );

  function openCreateForm() {
    setFormTechnician(null);
    setFormOpen(true);
  }

  function openEditForm(technician) {
    setOpenMenuId(null);
    setFormTechnician(technician);
    setFormOpen(true);
  }

  function saveTechnician(values) {
    return saveMutation.mutateAsync({ id: formTechnician?.id, values });
  }

  function confirmDelete() {
    if (!deleteTechnician) return;
    deleteMutation.mutate(deleteTechnician.id);
  }

  function toggleAvailability(technician) {
    const nextStatus = technician.status === "offline" ? "online" : "offline";
    availabilityMutation.mutate({ technician, nextStatus });
  }

  const deleteSubmitting = deleteMutation.isPending;

  return (
    <section>
      <WorkspacePageHeader
        eyebrow="Quản trị đội ngũ kỹ thuật"
        title="Nhân viên kỹ thuật (IT Agents)"
        description="Quản lý đội ngũ kỹ sư L1/L2/L3, chuyên môn và khối lượng ticket đang phụ trách."
        actions={
          <Button type="button" size="pill" onClick={openCreateForm}>
            <Plus className="size-4" />
            Thêm kỹ thuật viên
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <WorkspaceStatCard
          icon={Users}
          label="Tổng kỹ thuật viên"
          value={technicians.length}
          description="Nhân sự trong đội hỗ trợ"
        />
        <WorkspaceStatCard
          icon={UserCheck}
          label="Đang sẵn sàng"
          value={technicians.filter((item) => item.status === "online").length}
          description="Có thể nhận ticket mới"
          tone="emerald"
        />
        <WorkspaceStatCard
          icon={Wrench}
          label="Ticket đang xử lý"
          value={technicians.reduce((sum, item) => sum + item.active, 0)}
          description="Trên toàn bộ kỹ thuật viên"
          tone="violet"
        />
        <WorkspaceStatCard
          icon={CircleGauge}
          label="Đã hoàn thành"
          value={createdTicketCount}
          description="Tổng ticket đã xử lý xong"
          tone="amber"
        />
      </div>

      <div className="mt-6 rounded-xl border border-brand-bone bg-white p-3.5 shadow-xs">
        <div className="grid gap-3 sm:grid-cols-[1fr_14rem]">
          <label className="relative">
            <Search className="absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-brand-ash" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Tìm theo tên, email hoặc chuyên môn..."
              className="w-full rounded-lg border border-brand-bone bg-brand-mist py-2 pr-3 pl-10 text-xs font-medium text-brand-ink outline-none focus:border-brand-violet focus:bg-white"
            />
          </label>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="rounded-lg border border-brand-bone bg-brand-mist px-3 py-2 text-xs font-semibold text-brand-ink outline-none focus:border-brand-violet focus:bg-white"
          >
            <option value="">Tất cả trạng thái</option>
            <option value="online">Sẵn sàng</option>
            <option value="busy">Đang bận</option>
            <option value="offline">Ngoại tuyến</option>
          </select>
        </div>
      </div>

      {filtered.length ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {filtered.map((item) => {
            const state = STATUS[item.status] ?? STATUS.offline;
            return (
              <article
                key={item.id}
                className="rounded-xl border border-brand-bone bg-white p-5 shadow-xs transition-colors hover:border-brand-ash"
              >
                <div className="flex items-start gap-3.5">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-violet text-sm font-bold text-white">
                    {getInitials(item.name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h2 className="truncate font-display text-sm font-bold text-brand-ink">
                          {item.name}
                        </h2>
                        <p className="truncate font-mono text-xs text-brand-ash">
                          {item.email}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-start gap-1">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${state.classes}`}
                        >
                          {state.label}
                        </span>
                        <TechnicianActionMenu
                          technician={item}
                          open={openMenuId === item.id}
                          onToggle={() =>
                            setOpenMenuId((current) =>
                              current === item.id ? null : item.id,
                            )
                          }
                          onClose={() => setOpenMenuId(null)}
                          onEdit={() => openEditForm(item)}
                          onDelete={() => {
                            setOpenMenuId(null);
                            setDeleteTechnician(item);
                          }}
                        />
                      </div>
                    </div>
                    <p className="mt-2 text-xs font-medium text-brand-slate">
                      {item.specialization}
                    </p>
                  </div>
                </div>
                <dl className="mt-4 grid grid-cols-4 gap-2 border-t border-brand-bone pt-3.5 text-center">
                  <div>
                    <dt className="text-[11px] text-brand-ash">Đang xử lý</dt>
                    <dd className="mt-0.5 font-mono text-sm font-bold text-brand-violet">
                      {item.active}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] text-brand-ash">Hoàn thành</dt>
                    <dd className="mt-0.5 font-mono text-sm font-bold text-brand-ink">
                      {item.completed}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] text-brand-ash">CSAT</dt>
                    <dd className="mt-0.5 flex items-center justify-center gap-1 font-mono text-sm font-bold text-brand-ink">
                      <Star className="size-3 fill-amber-400 text-amber-400" />
                      {item.rating}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] text-brand-ash">Tỷ lệ xong</dt>
                    <dd className="mt-0.5 font-mono text-sm font-bold text-brand-emerald">
                      {item.active + item.completed > 0
                        ? `${Math.round((item.completed / (item.active + item.completed)) * 100)}%`
                        : "—"}
                    </dd>
                  </div>
                </dl>
                <button
                  type="button"
                  onClick={() => toggleAvailability(item)}
                  className="mt-4 w-full rounded-lg border border-brand-bone bg-brand-mist/50 py-2 text-xs font-semibold text-brand-ink transition hover:bg-brand-mist"
                >
                  {item.status === "offline"
                    ? "Kích hoạt làm việc"
                    : "Đặt ngoại tuyến"}
                </button>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-brand-bone bg-white px-5 py-16 text-center text-xs text-brand-slate">
          Không tìm thấy kỹ thuật viên phù hợp.
        </div>
      )}

      {formOpen ? (
        <TechnicianFormModal
          key={formTechnician?.id ?? "new"}
          technician={formTechnician}
          technicians={technicians}
          onClose={() => setFormOpen(false)}
          onSave={saveTechnician}
        />
      ) : null}

      {deleteTechnician ? (
        <ConfirmActionModal
          title="Xóa kỹ thuật viên?"
          description={`Bạn có chắc muốn xóa ${deleteTechnician.name} khỏi đội hỗ trợ? Thao tác này không thể hoàn tác trong phiên hiện tại.`}
          confirmLabel="Xóa kỹ thuật viên"
          submitting={deleteSubmitting}
          onCancel={() => setDeleteTechnician(null)}
          onConfirm={confirmDelete}
        />
      ) : null}
    </section>
  );
}

export default AdminTechniciansPage;
