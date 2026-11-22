/**
 * Trang Quản Lý Bản Quyền Phần Mềm & Chi Phí CNTT (Software Asset Management & FinOps).
 *
 * Vai trò trong hệ thống IT Helpdesk:
 * - Đối với Admin / Kỹ thuật viên: quản lý danh sách phần mềm bản quyền (SaaS, Vĩnh viễn, Volume, OEM),
 *   theo dõi số lượng seat đã cấp phát/còn trống, cảnh báo sắp hết hạn, kiểm soát chi phí FinOps
 *   và thực hiện cấp phát/thu hồi bản quyền cho nhân viên.
 * - Đối với Nhân viên (role "user"): hiển thị góc nhìn "Bản Quyền Phần Mềm Của Tôi"
 *   đồng bộ theo thiết bị đang sử dụng.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  AppWindow,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { toast } from "react-toastify";
import WorkspacePageHeader from "../../components/common/WorkspacePageHeader.jsx";
import WorkspaceStatCard from "../../components/common/WorkspaceStatCard.jsx";
import ConfirmActionModal from "../../components/common/ConfirmActionModal.jsx";
import SoftwareFinOpsSummary from "../../components/software/SoftwareFinOpsSummary.jsx";
import SoftwareTable from "../../components/software/SoftwareTable.jsx";
import SoftwareFormModal from "../../components/software/SoftwareFormModal.jsx";
import AllocateLicenseModal from "../../components/software/AllocateLicenseModal.jsx";
import AllocatedUsersDrawer from "../../components/software/AllocatedUsersDrawer.jsx";
import useAuth from "../../hooks/useAuth.js";
import {
  deleteSoftwareLicense,
  getFinOpsSummary,
  getSoftwareLicenses,
} from "../../services/softwareService.js";

// Danh sách nhóm danh mục phần mềm dùng cho bộ lọc tìm kiếm
const CATEGORIES = [
  "Văn phòng & Email",
  "Thiết kế & Đồ họa",
  "Lập trình & Phát triển",
  "Bảo mật & Tiện ích",
  "Giao tiếp & Cộng tác",
  "Hệ điều hành & Máy chủ",
  "Khác",
];

// Danh sách các hình thức cấp phép phần mềm hỗ trợ lọc
const TYPES = [
  { value: "saas_subscription", label: "SaaS Cloud" },
  { value: "perpetual", label: "Vĩnh Viễn" },
  { value: "volume", label: "Volume License" },
  { value: "oem", label: "OEM Bản Quyền" },
];

// Danh sách các trạng thái hiệu lực bản quyền để lọc trên giao diện
const STATUSES = [
  { value: "active", label: "Đang Hoạt Động" },
  { value: "expiring_soon", label: "Sắp Hết Hạn" },
  { value: "expired", label: "Đã Hết Hạn" },
];

/**
 * Component chính của trang Quản lý bản quyền phần mềm và chi phí FinOps.
 * Hỗ trợ phân quyền hiển thị giữa Admin, Kỹ thuật viên và Nhân viên.
 */
function SoftwareLicensePage() {
  // Client React Query phục vụ invalidate toàn bộ cache nhánh ["software"]
  const queryClient = useQueryClient();
  // Xác định vai trò người dùng hiện tại để điều chỉnh giao diện và quyền gọi API FinOps
  const { user } = useAuth();
  const role = user?.role || "admin";
  const isUserRole = role === "user";
  const isAdmin = role === "admin";

  // Filters
  // Các state lưu trữ tiêu chí tìm kiếm và bộ lọc gửi lên API danh sách bản quyền
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  // Modals state
  // Các state quản lý modal thêm/sửa bản quyền, cấp phát seat, drawer danh sách người dùng và xác nhận xóa
  const [formLicense, setFormLicense] = useState(null); // null = closed, {} = create, obj = edit
  const [allocateTarget, setAllocateTarget] = useState(null);
  const [viewUsersTargetId, setViewUsersTargetId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Luồng lấy dữ liệu 1: truy vấn danh sách bản quyền phần mềm theo từ khóa và bộ lọc hiện hành
  const licensesQuery = useQuery({
    queryKey: [
      "software",
      "list",
      { search, category: categoryFilter, type: typeFilter, status: statusFilter },
    ],
    queryFn: ({ signal }) =>
      getSoftwareLicenses(
        {
          search: search.trim() || undefined,
          category: categoryFilter || undefined,
          type: typeFilter || undefined,
          status: statusFilter || undefined,
        },
        { signal },
      ),
  });

  // Luồng lấy dữ liệu 2: truy vấn báo cáo tổng hợp chi phí FinOps (tắt đối với vai trò user thường)
  const finOpsQuery = useQuery({
    queryKey: ["software", "finops"],
    queryFn: ({ signal }) => getFinOpsSummary({ signal }),
    enabled: !isUserRole,
  });

  // Hiển thị toast thông báo nếu tải danh sách bản quyền hoặc dữ liệu FinOps gặp lỗi
  useEffect(() => {
    const error = licensesQuery.error || (!isUserRole ? finOpsQuery.error : null);
    if (error) {
      toast.error(
        error.message || "Không thể tải danh sách bản quyền phần mềm.",
      );
    }
  }, [licensesQuery.error, finOpsQuery.error, isUserRole]);

  // Trích xuất dữ liệu và tính số lượng bản quyền hợp lệ / cần chú ý cho thẻ thống kê của user
  const licenses = licensesQuery.data?.licenses || [];
  const finOps = finOpsQuery.data || {};
  const isLoading = licensesQuery.isLoading || licensesQuery.isFetching;
  const activeLicensesCount = licenses.filter((lic) => lic.status === "active").length;
  const attentionLicensesCount = licenses.filter((lic) => lic.status !== "active").length;

  // Làm mới đồng thời cache danh sách bản quyền và báo cáo FinOps dưới nhánh key ["software"]
  const refreshData = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["software"] });
  }, [queryClient]);

  /**
   * Xử lý xác nhận xóa vĩnh viễn gói bản quyền phần mềm khỏi hệ thống và làm mới cache.
   */
  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteSoftwareLicense(deleteTarget._id);
      toast.success(`Đã xóa bản quyền ${deleteTarget.name} thành công.`);
      setDeleteTarget(null);
      refreshData();
    } catch (error) {
      toast.error(error.response?.data?.message || "Xóa bản quyền thất bại.");
    } finally {
      setIsDeleting(false);
    }
  }

  // Kiểm tra xem có bất kỳ bộ lọc hoặc từ khóa tìm kiếm nào đang được áp dụng hay không
  const isFilterActive = Boolean(search || categoryFilter || typeFilter || statusFilter);

  /**
   * Đặt lại toàn bộ bộ lọc tìm kiếm phần mềm về trạng thái mặc định ban đầu.
   */
  function handleResetFilters() {
    setSearch("");
    setCategoryFilter("");
    setTypeFilter("");
    setStatusFilter("");
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      {/* Tiêu đề trang thích ứng theo vai trò nhân viên (user) hoặc quản trị (admin/technician) */}
      <WorkspacePageHeader
        eyebrow={
          isUserRole
            ? "Cổng Nhân Viên • Bản Quyền Phần Mềm"
            : "Software Asset Management • FinOps Realtime"
        }
        title={
          isUserRole
            ? "Bản Quyền Phần Mềm Của Tôi"
            : "Quản Lý Bản Quyền Phần Mềm & Chi Phí CNTT"
        }
        description={
          isUserRole
            ? "Danh sách các phần mềm bản quyền công ty đã cấp phát theo thiết bị bạn đang sử dụng. Bản quyền sẽ tự động cập nhật khi cấp hoặc thu hồi thiết bị."
            : "Theo dõi toàn diện giấy phép bản quyền SaaS, Desktop, Cloud, kiểm soát số lượng seats cấp phát và loại bỏ chi phí lãng phí."
        }
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={refreshData}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-brand-bone bg-white text-xs font-semibold text-brand-slate hover:text-brand-ink hover:bg-brand-mist transition-colors shadow-2xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">Làm mới</span>
            </button>
            {isAdmin && (
              <button
                type="button"
                onClick={() => setFormLicense({})}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-brand-violet text-white text-xs font-semibold hover:bg-purple-700 active:scale-95 transition-all shadow-sm"
              >
                <Plus className="w-4 h-4" />
                <span>Thêm Bản Quyền Mới</span>
              </button>
            )}
          </div>
        }
      />

      {/* Summary Cards */}
      {/* Thẻ tóm tắt: hiển thị thẻ thống kê cá nhân cho user hoặc bảng phân tích FinOps cho Admin/IT */}
      {isUserRole ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <WorkspaceStatCard
            icon={AppWindow}
            label="Bản quyền đang được cấp"
            value={licenses.length}
            description="Phần mềm đồng bộ theo thiết bị đang sử dụng"
            tone="violet"
          />
          <WorkspaceStatCard
            icon={ShieldCheck}
            label="Đang hoạt động tốt"
            value={activeLicensesCount}
            description="Bản quyền hợp lệ và còn hiệu lực"
            tone="emerald"
          />
          <WorkspaceStatCard
            icon={AlertTriangle}
            label="Sắp hết hạn / Cần gia hạn"
            value={attentionLicensesCount}
            description="Gói bản quyền cần IT kiểm tra hoặc gia hạn"
            tone={attentionLicensesCount > 0 ? "amber" : "blue"}
          />
        </div>
      ) : (
        <SoftwareFinOpsSummary finOps={finOps} />
      )}

      {/* Filter and Search Bar */}
      {/* Thanh tìm kiếm và lọc bản quyền theo danh mục, hình thức cấp phép và trạng thái */}
      <div className="bg-white rounded-2xl border border-brand-bone p-4 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row gap-3">
          {/* Search box */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-brand-ash" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm theo tên phần mềm, nhà cung cấp, key..."
              className="w-full text-xs rounded-xl border border-brand-bone pl-9 pr-3 py-2 bg-brand-mist/30 text-brand-onyx placeholder:text-brand-ash focus:bg-white focus:ring-2 focus:ring-brand-violet/20 focus:border-brand-violet outline-hidden transition-all"
            />
          </div>

          {/* Category Filter */}
          <div className="w-full md:w-48">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full text-xs rounded-xl border border-brand-bone px-3 py-2 bg-white text-brand-onyx focus:ring-2 focus:ring-brand-violet/20 focus:border-brand-violet outline-hidden"
            >
              <option value="">Tất cả danh mục</option>
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {/* Type Filter */}
          <div className="w-full md:w-40">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="w-full text-xs rounded-xl border border-brand-bone px-3 py-2 bg-white text-brand-onyx focus:ring-2 focus:ring-brand-violet/20 focus:border-brand-violet outline-hidden"
            >
              <option value="">Tất cả hình thức</option>
              {TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div className="w-full md:w-40">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full text-xs rounded-xl border border-brand-bone px-3 py-2 bg-white text-brand-onyx focus:ring-2 focus:ring-brand-violet/20 focus:border-brand-violet outline-hidden"
            >
              <option value="">Tất cả trạng thái</option>
              {STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          {/* Reset button */}
          {isFilterActive && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-brand-bone text-brand-slate hover:bg-brand-mist text-xs font-medium transition-colors shrink-0"
              title="Xóa bộ lọc"
            >
              <X className="w-3.5 h-3.5" />
              <span>Xóa lọc</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Table Card */}
      {/* Bảng hiển thị chi tiết danh sách bản quyền phần mềm */}
      <div className="bg-white rounded-2xl border border-brand-bone shadow-xs overflow-hidden">
        <SoftwareTable
          licenses={licenses}
          role={role}
          currentUserId={user?._id}
          onAllocate={(lic) => setAllocateTarget(lic)}
          onViewUsers={(lic) => setViewUsersTargetId(lic._id)}
          onEdit={(lic) => setFormLicense(lic)}
          onDelete={(lic) => setDeleteTarget(lic)}
        />
      </div>

      {/* Modals & Drawers */}
      {/* Modal thêm mới hoặc chỉnh sửa thông tin bản quyền */}
      {formLicense && (
        <SoftwareFormModal
          license={formLicense._id ? formLicense : null}
          onClose={() => setFormLicense(null)}
          onSaved={() => {
            setFormLicense(null);
            refreshData();
          }}
        />
      )}

      {/* Modal cấp phát seat bản quyền phần mềm cho nhân viên */}
      {allocateTarget && (
        <AllocateLicenseModal
          license={allocateTarget}
          onClose={() => setAllocateTarget(null)}
          onAllocated={() => {
            setAllocateTarget(null);
            refreshData();
          }}
        />
      )}

      {/* Drawer xem và thu hồi seat của các nhân viên đang được cấp bản quyền */}
      {viewUsersTargetId && (
        <AllocatedUsersDrawer
          licenseId={viewUsersTargetId}
          onClose={() => setViewUsersTargetId(null)}
          onRevoked={() => {
            refreshData();
          }}
        />
      )}

      {/* Modal xác nhận xóa vĩnh viễn gói bản quyền */}
      {deleteTarget && (
        <ConfirmActionModal
          title={`Xác Nhận Xóa Bản Quyền "${deleteTarget.name}"?`}
          description="Hành động này sẽ xóa hoàn toàn thông tin phần mềm, bao gồm lịch sử cấp phát seat của tất cả nhân viên liên quan."
          confirmLabel="Xóa Bản Quyền"
          submitting={isDeleting}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={handleDeleteConfirm}
        />
      )}
    </div>
  );
}

export default SoftwareLicensePage;
