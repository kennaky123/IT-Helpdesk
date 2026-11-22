/**
 * Trang Quản Lý Kho Thiết Bị & Cấp Phát Laptop (IT Asset Management / CMDB).
 *
 * Vai trò trong hệ thống IT Helpdesk:
 * - Quản lý toàn bộ vòng đời tài sản CNTT (laptop, PC, màn hình, phụ kiện): nhập kho,
 *   cấp phát cho nhân viên, thu hồi về kho, chỉnh sửa/xóa, xem lịch sử biến động
 *   và hỗ trợ kết nối điều khiển từ xa (AnyDesk / TeamViewer).
 * - Quản lý luồng Yêu cầu cấp phát laptop giữa Admin và đội ngũ Kỹ thuật viên
 *   (tạo yêu cầu, tiếp nhận, hoàn tất bàn giao hoặc hủy yêu cầu).
 * - Hỗ trợ nhân viên (role "user") tải bộ cài USB Agent trực tiếp từ thanh tác vụ.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Download,
  Laptop,
  Plus,
  RefreshCw,
  Search,
  Send,
} from "lucide-react";
import { toast } from "react-toastify";
import AssetFormModal from "../../components/assets/AssetFormModal.jsx";
import AssetHistoryDrawer from "../../components/assets/AssetHistoryDrawer.jsx";
import AssetRequestsTable from "../../components/assets/AssetRequestsTable.jsx";
import AssetStatsGrid from "../../components/assets/AssetStatsGrid.jsx";
import AssetsTable from "../../components/assets/AssetsTable.jsx";
import AssignAssetModal from "../../components/assets/AssignAssetModal.jsx";
import CompleteAssetRequestModal from "../../components/assets/CompleteAssetRequestModal.jsx";
import CreateAssetRequestModal from "../../components/assets/CreateAssetRequestModal.jsx";
import RemoteConnectModal from "../../components/assets/RemoteConnectModal.jsx";
import ReturnAssetModal from "../../components/assets/ReturnAssetModal.jsx";
import ConfirmActionModal from "../../components/common/ConfirmActionModal.jsx";
import WorkspacePageHeader from "../../components/common/WorkspacePageHeader.jsx";
import { Tabs, TabsList, TabsTrigger } from "../../components/ui/tabs.jsx";
import useAuth from "../../hooks/useAuth.js";
import {
  acceptAssetRequest,
  cancelAssetRequest,
  deleteAsset,
  getAssetRequests,
  getAssets,
} from "../../services/assetService.js";
import { getAgentDownloadUrl } from "../../services/usbService.js";

/**
 * Component chính của trang Quản lý Kho thiết bị & Yêu cầu cấp phát.
 * Điều phối hai tab chính ("assets" và "requests") cùng các modal/drawer thao tác vòng đời tài sản.
 */
function AssetManagementPage() {
  // Client React Query dùng để invalidate cache nhóm ["assets"] sau mỗi thao tác cập nhật
  const queryClient = useQueryClient();
  // Lấy thông tin người dùng hiện tại để phân quyền hiển thị nút chức năng theo vai trò
  const { user } = useAuth();
  const role = user?.role || "admin";

  // Tab đang hiển thị trên giao diện
  const [activeTab, setActiveTab] = useState("assets"); // "assets" | "requests"

  // Filters
  // Các state bộ lọc cho danh sách thiết bị (tìm kiếm, trạng thái và loại thiết bị)
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");

  // Modals state
  // Các state điều khiển modal/drawer thao tác trực tiếp trên thiết bị
  const [formAsset, setFormAsset] = useState(null); // null = closed, {} = create, obj = edit
  const [assignAssetTarget, setAssignAssetTarget] = useState(null);
  const [returnAssetTarget, setReturnAssetTarget] = useState(null);
  const [historyAssetId, setHistoryAssetId] = useState(null);
  const [remoteAsset, setRemoteAsset] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  // Request Modals
  // Các state điều khiển modal quy trình yêu cầu cấp phát laptop
  const [isCreateRequestOpen, setIsCreateRequestOpen] = useState(false);
  const [completeRequestTarget, setCompleteRequestTarget] = useState(null);
  const [cancelRequestTarget, setCancelRequestTarget] = useState(null);

  // Luồng lấy dữ liệu 1: truy vấn danh sách thiết bị & số liệu tổng hợp theo bộ lọc hiện hành
  const assetsQuery = useQuery({
    queryKey: ["assets", "list", { search, status: statusFilter, type: typeFilter }],
    queryFn: ({ signal }) =>
      getAssets({ search, status: statusFilter, type: typeFilter }, { signal }),
  });

  // Luồng lấy dữ liệu 2: truy vấn danh sách yêu cầu cấp phát laptop từ Admin tới Kỹ thuật viên
  const requestsQuery = useQuery({
    queryKey: ["assets", "requests"],
    queryFn: ({ signal }) => getAssetRequests({}, { signal }),
  });

  // Theo dõi lỗi tải dữ liệu từ cả 2 truy vấn và hiển thị thông báo toast
  useEffect(() => {
    const error = assetsQuery.error || requestsQuery.error;
    if (error) {
      toast.error(error.message || "Không thể tải dữ liệu kho thiết bị.");
    }
  }, [assetsQuery.error, requestsQuery.error]);

  // Trích xuất dữ liệu thiết bị, thống kê tổng quan và danh sách yêu cầu với giá trị dự phòng an toàn
  const assets = assetsQuery.data?.assets || [];
  const summary = useMemo(() => assetsQuery.data?.summary || {}, [assetsQuery.data]);
  const requests = useMemo(() => requestsQuery.data || [], [requestsQuery.data]);

  // Làm mới toàn bộ cache React Query thuộc nhánh ["assets"] (bao gồm danh sách thiết bị và yêu cầu cấp phát)
  const refreshData = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["assets"] });
  }, [queryClient]);

  // Actions
  /**
   * Xử lý xác nhận xóa thiết bị khỏi kho CMDB, thông báo kết quả và invalidate cache.
   */
  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    try {
      await deleteAsset(deleteTarget._id);
      toast.success(`Xóa thiết bị ${deleteTarget.assetTag} thành công.`);
      setDeleteTarget(null);
      refreshData();
    } catch (error) {
      toast.error(error.response?.data?.message || "Xóa thiết bị thất bại.");
    }
  }

  /**
   * Kỹ thuật viên nhấn tiếp nhận một yêu cầu cấp phát laptop, chuyển trạng thái xử lý và làm mới dữ liệu.
   */
  async function handleAcceptRequest(req) {
    try {
      await acceptAssetRequest(req._id);
      toast.success(`Đã tiếp nhận yêu cầu ${req.requestCode}! Hãy chuẩn bị thiết bị để bàn giao.`);
      refreshData();
    } catch (error) {
      toast.error(error.response?.data?.message || "Tiếp nhận yêu cầu thất bại.");
    }
  }

  /**
   * Hủy yêu cầu cấp phát laptop kèm lý do nhập từ modal xác nhận, sau đó làm mới cache.
   */
  async function handleCancelRequestConfirm(note) {
    if (!cancelRequestTarget) return;
    try {
      await cancelAssetRequest(cancelRequestTarget._id, { reason: note });
      toast.success(`Đã hủy yêu cầu ${cancelRequestTarget.requestCode}.`);
      setCancelRequestTarget(null);
      refreshData();
    } catch (error) {
      toast.error(error.response?.data?.message || "Hủy yêu cầu thất bại.");
    }
  }

  // Đếm số lượng yêu cầu cấp phát đang chờ hoặc đang thực hiện để hiển thị huy hiệu trên tab
  const pendingRequestsCount = useMemo(() => {
    return requests.filter((r) => r.status === "pending" || r.status === "in_progress").length;
  }, [requests]);

  return (
    <div className="space-y-6">
      {/* Header */}
      {/* Tiêu đề trang kèm các nút hành động phân quyền theo vai trò user / admin */}
      <WorkspacePageHeader
        eyebrow="IT Asset Management • Realtime"
        title="Quản Lý Kho Thiết Bị & Cấp Phát Laptop"
        description="Quản lý toàn bộ vòng đời laptop, PC và thiết bị công ty. Theo dõi chi tiết ai đang sử dụng máy nào, thiết bị nào sẵn sàng trong kho, hỗ trợ kỹ thuật 1-click qua AnyDesk / TeamViewer và quy trình Admin yêu cầu cấp phát máy."
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={refreshData}
              title="Làm mới dữ liệu"
              className="p-2 rounded-xl border border-brand-bone bg-white text-brand-slate hover:text-brand-ink hover:bg-brand-mist transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
            </button>

            {role === "user" && (
              <a
                href={getAgentDownloadUrl()}
                download="ITHelpdeskUSBAgent.exe"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-brand-violet text-white text-xs font-bold hover:bg-purple-700 transition-colors shadow-2xs"
              >
                <Download className="w-4 h-4" />
                Tải USB Agent (.EXE)
              </a>
            )}

            {role === "admin" && (
              <>
                <button
                  type="button"
                  onClick={() => setIsCreateRequestOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-purple-50 text-brand-violet border border-purple-200 text-xs font-bold hover:bg-purple-100 transition-colors shadow-2xs"
                >
                  <Send className="w-4 h-4" />
                  Yêu Cầu Cấp Laptop
                </button>

                <button
                  type="button"
                  onClick={() => setFormAsset({})}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-brand-violet text-white text-xs font-bold hover:bg-purple-700 transition-colors shadow-2xs"
                >
                  <Plus className="w-4 h-4" />
                  Nhập Thiết Bị Vào Kho
                </button>
              </>
            )}
          </div>
        }
      />

      {/* Stats Summary */}
      {/* Lưới thẻ tổng quan số lượng thiết bị theo trạng thái trong kho */}
      <AssetStatsGrid summary={summary} />

      {/* Tabs and Filters */}
      {/* Khung chứa hệ thống Tab chuyển đổi và bộ lọc/bảng dữ liệu */}
      <div className="bg-white rounded-2xl border border-brand-bone shadow-xs overflow-hidden">
        {/* Navigation Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="flex items-center justify-between border-b border-brand-bone px-5 py-2.5">
            <TabsList>
              <TabsTrigger value="assets">
                <Laptop className="w-4 h-4" />
                Kho Thiết Bị & Đang Sử Dụng
                <span className="px-2 py-0.5 rounded-full text-[10px] bg-white/80 text-brand-ink">
                  {summary.total ?? 0}
                </span>
              </TabsTrigger>
              <TabsTrigger value="requests">
                <Send className="w-4 h-4" />
                Yêu Cầu Cấp Phát Laptop
                {pendingRequestsCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] bg-amber-100 text-amber-800 font-bold">
                    {pendingRequestsCount} chờ xử lý
                  </span>
                )}
              </TabsTrigger>
            </TabsList>
          </div>
        </Tabs>

        {/* Tab 1: Assets in stock & in use */}
        {/* Nội dung Tab 1: Bộ lọc và bảng quản lý thiết bị trong kho / đang cấp phát */}
        {activeTab === "assets" && (
          <div>
            {/* Filter Bar */}
            <div className="p-4 border-b border-brand-bone flex flex-wrap items-center justify-between gap-3 bg-brand-mist/20">
              <div className="relative flex-1 min-w-[240px] max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-ash" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Tìm theo Asset Tag, tên máy, serial, người đang dùng..."
                  className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-brand-bone bg-white focus:outline-none focus:ring-2 focus:ring-brand-violet/20 focus:border-brand-violet"
                />
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-3 py-1.5 text-xs rounded-xl border border-brand-bone bg-white focus:outline-none focus:ring-2 focus:ring-brand-violet/20"
                >
                  <option value="">Tất cả trạng thái</option>
                  <option value="in_stock">Trong Kho (Sẵn sàng)</option>
                  <option value="in_use">Đang Sử Dụng (Cấp phát)</option>
                  <option value="maintenance">Đang Bảo Trì</option>
                  <option value="retired">Ngưng Sử Dụng</option>
                </select>

                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="px-3 py-1.5 text-xs rounded-xl border border-brand-bone bg-white focus:outline-none focus:ring-2 focus:ring-brand-violet/20"
                >
                  <option value="">Tất cả loại thiết bị</option>
                  <option value="laptop">Laptop</option>
                  <option value="desktop">Desktop / PC</option>
                  <option value="monitor">Màn hình</option>
                  <option value="accessory">Phụ kiện</option>
                  <option value="other">Khác</option>
                </select>
              </div>
            </div>

            {/* Table */}
            <AssetsTable
              assets={assets}
              role={role}
              onAssign={(asset) => setAssignAssetTarget(asset)}
              onReturn={(asset) => setReturnAssetTarget(asset)}
              onEdit={(asset) => setFormAsset(asset)}
              onDelete={(asset) => setDeleteTarget(asset)}
              onViewHistory={(id) => setHistoryAssetId(id)}
              onRemoteConnect={(asset) => setRemoteAsset(asset)}
            />
          </div>
        )}

        {/* Tab 2: Asset Requests */}
        {/* Nội dung Tab 2: Danh sách yêu cầu cấp phát laptop giữa Admin và Kỹ thuật viên */}
        {activeTab === "requests" && (
          <div>
            <div className="p-4 border-b border-brand-bone bg-brand-mist/20 flex items-center justify-between">
              <div className="text-xs text-brand-slate">
                Danh sách các yêu cầu bàn giao laptop từ Admin tới đội ngũ Kỹ thuật viên (Technician).
              </div>
              {role === "admin" && (
                <button
                  type="button"
                  onClick={() => setIsCreateRequestOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-brand-violet text-white text-xs font-bold hover:bg-purple-700 transition-colors shadow-2xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Tạo Yêu Cầu Cấp Phát Mới
                </button>
              )}
            </div>

            <AssetRequestsTable
              requests={requests}
              role={role}
              currentUserId={user?._id}
              onAccept={handleAcceptRequest}
              onComplete={(req) => setCompleteRequestTarget(req)}
              onCancel={(req) => setCancelRequestTarget(req)}
            />
          </div>
        )}
      </div>

      {/* Modals & Drawers */}
      {/* Modal thêm/chỉnh sửa thông tin thiết bị */}
      {formAsset && (
        <AssetFormModal
          asset={formAsset}
          onClose={() => setFormAsset(null)}
          onSaved={() => {
            setFormAsset(null);
            refreshData();
          }}
        />
      )}

      {/* Modal cấp phát thiết bị cho nhân viên */}
      {assignAssetTarget && (
        <AssignAssetModal
          asset={assignAssetTarget}
          onClose={() => setAssignAssetTarget(null)}
          onAssigned={() => {
            setAssignAssetTarget(null);
            refreshData();
          }}
        />
      )}

      {/* Modal thu hồi thiết bị từ nhân viên về lại kho */}
      {returnAssetTarget && (
        <ReturnAssetModal
          asset={returnAssetTarget}
          onClose={() => setReturnAssetTarget(null)}
          onReturned={() => {
            setReturnAssetTarget(null);
            refreshData();
          }}
        />
      )}

      {/* Modal cấu hình hoặc mở kết nối hỗ trợ từ xa (AnyDesk / TeamViewer) */}
      {remoteAsset && (
        <RemoteConnectModal
          asset={remoteAsset}
          onClose={() => setRemoteAsset(null)}
          onUpdated={() => {
            setRemoteAsset(null);
            refreshData();
          }}
        />
      )}

      {/* Drawer xem lịch sử cấp phát và bảo trì của thiết bị */}
      {historyAssetId && (
        <AssetHistoryDrawer
          assetId={historyAssetId}
          onClose={() => setHistoryAssetId(null)}
        />
      )}

      {/* Modal Admin tạo yêu cầu cấp phát laptop mới cho kỹ thuật viên */}
      {isCreateRequestOpen && (
        <CreateAssetRequestModal
          onClose={() => setIsCreateRequestOpen(false)}
          onCreated={() => {
            setIsCreateRequestOpen(false);
            refreshData();
          }}
        />
      )}

      {/* Modal kỹ thuật viên hoàn tất bàn giao thiết bị cho yêu cầu cấp phát */}
      {completeRequestTarget && (
        <CompleteAssetRequestModal
          request={completeRequestTarget}
          onClose={() => setCompleteRequestTarget(null)}
          onCompleted={() => {
            setCompleteRequestTarget(null);
            refreshData();
          }}
        />
      )}

      {/* Modal xác nhận xóa vĩnh viễn thiết bị khỏi kho */}
      {deleteTarget && (
        <ConfirmActionModal
          title="Xác Nhận Xóa Thiết Bị"
          description={`Bạn có chắc chắn muốn xóa thiết bị [${deleteTarget.assetTag}] "${deleteTarget.name}" khỏi hệ thống? Hành động này không thể hoàn tác.`}
          confirmLabel="Xóa Thiết Bị"
          onCancel={() => setDeleteTarget(null)}
          onConfirm={handleDeleteConfirm}
        />
      )}

      {/* Modal xác nhận hủy yêu cầu cấp phát laptop kèm ô nhập lý do */}
      {cancelRequestTarget && (
        <ConfirmActionModal
          title="Xác Nhận Hủy Yêu Cầu Cấp Phát"
          description={`Bạn có chắc chắn muốn hủy yêu cầu cấp phát laptop [${cancelRequestTarget.requestCode}] cho nhân viên "${cancelRequestTarget.employee?.fullName}"?`}
          confirmLabel="Hủy Yêu Cầu"
          noteLabel="Lý do hủy yêu cầu"
          notePlaceholder="Nhập lý do hủy bỏ cấp phát laptop..."
          onCancel={() => setCancelRequestTarget(null)}
          onConfirm={handleCancelRequestConfirm}
        />
      )}
    </div>
  );
}

export default AssetManagementPage;
