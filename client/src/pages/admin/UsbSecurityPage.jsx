/**
 * Trang Giám Sát & Quản Lý Thiết Bị Ngoại Vi USB (Endpoint Security & DLP).
 *
 * Vai trò trong hệ thống IT Helpdesk:
 * - Nhận dữ liệu giám sát thiết bị ngoại vi thời gian thực từ các máy trạm cài ITHelpdeskUSBAgent.exe.
 * - Giúp Admin và Kỹ thuật viên kiểm soát danh sách thiết bị USB đã cắm vào hệ thống mạng,
 *   phát hiện thiết bị chưa xác minh, phê duyệt (Whitelist) hoặc chặn (Blacklist) nhanh chóng,
 *   xem nhật ký cắm/rút chi tiết và chạy giả lập sự kiện USB để kiểm thử luồng cảnh báo.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  Download,
  RefreshCw,
  Search,
  ShieldAlert,
  Usb,
  X,
} from "lucide-react";
import { toast } from "react-toastify";
import ConfirmActionModal from "../../components/common/ConfirmActionModal.jsx";
import WorkspacePageHeader from "../../components/common/WorkspacePageHeader.jsx";
import { Tabs, TabsList, TabsTrigger } from "../../components/ui/tabs.jsx";
import UsbAgentConnectionBanner from "../../components/usb/UsbAgentConnectionBanner.jsx";
import UsbDevicesTable from "../../components/usb/UsbDevicesTable.jsx";
import UsbEventsTable from "../../components/usb/UsbEventsTable.jsx";
import UsbPolicyModal from "../../components/usb/UsbPolicyModal.jsx";
import UsbStatsGrid from "../../components/usb/UsbStatsGrid.jsx";
import useAuth from "../../hooks/useAuth.js";
import {
  deleteUsbDevice,
  getAgentDownloadUrl,
  getUsbDashboard,
  sendAgentUsbEvent,
  updateUsbDevicePolicy,
} from "../../services/usbService.js";

// Danh sách các tùy chọn lọc theo trạng thái chính sách bảo mật USB
const STATUS_OPTIONS = [
  { value: "unverified", label: "Chưa xác minh (Cảnh báo)" },
  { value: "trusted", label: "Đã phê duyệt (Whitelist)" },
  { value: "blocked", label: "Bị chặn (Blacklist)" },
];

// Danh sách các tùy chọn lọc theo phân loại phần cứng thiết bị USB
const TYPE_OPTIONS = [
  { value: "storage", label: "USB Lưu Trữ (Flash / HDD)" },
  { value: "input_hid", label: "Chuột / Phím HID" },
  { value: "mobile_mtp", label: "Điện Thoại MTP" },
  { value: "audio_video", label: "Âm Thanh / Camera" },
  { value: "other_usb", label: "Ngoại Vi USB Khác" },
];

/**
 * Component chính của trang Giám sát & Quản lý Thiết bị Ngoại vi USB.
 * Quản lý truy vấn dữ liệu dashboard USB, chuyển tab thiết bị/nhật ký, lọc và cập nhật chính sách Whitelist/Blacklist.
 */
function UsbSecurityPage() {
  // Client React Query để làm mới cache nhánh ["usb"] sau các thao tác chính sách/xóa/giả lập
  const queryClient = useQueryClient();
  // Lấy vai trò người dùng hiện tại để truyền xuống bảng thiết bị phân quyền thao tác
  const { user } = useAuth();
  const role = user?.role || "admin";

  // Tab đang xem: danh sách thiết bị USB hoặc nhật ký sự kiện cắm/rút
  const [activeTab, setActiveTab] = useState("devices"); // "devices" | "events"
  // Cờ đang gửi sự kiện giả lập cắm USB từ trình duyệt
  const [isSimulating, setIsSimulating] = useState(false);

  // Filters
  // Các state bộ lọc gửi lên API dashboard giám sát USB
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [deviceTypeFilter, setDeviceTypeFilter] = useState("");
  const [connectionStateFilter, setConnectionStateFilter] = useState("");

  // Modals
  // State thiết bị đang chỉnh sửa chính sách chi tiết và thiết bị chờ xác nhận xóa
  const [policyTarget, setPolicyTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Luồng lấy dữ liệu: truy vấn đồng bộ danh sách thiết bị, nhật ký sự kiện, thống kê và thông tin LAN Agent
  const usbQuery = useQuery({
    queryKey: [
      "usb",
      "dashboard",
      {
        search,
        status: statusFilter,
        deviceType: deviceTypeFilter,
        connectionState: connectionStateFilter,
      },
    ],
    queryFn: ({ signal }) =>
      getUsbDashboard(
        {
          search: search.trim() || undefined,
          status: statusFilter || undefined,
          deviceType: deviceTypeFilter || undefined,
          connectionState: connectionStateFilter || undefined,
        },
        { signal },
      ),
  });

  // Hiển thị toast thông báo nếu truy vấn dữ liệu giám sát USB gặp lỗi
  useEffect(() => {
    if (usbQuery.error) {
      toast.error(
        usbQuery.error.message ||
          "Không thể tải dữ liệu giám sát thiết bị USB.",
      );
    }
  }, [usbQuery.error]);

  // Trích xuất dữ liệu thiết bị, nhật ký sự kiện, thống kê tổng quan và cấu hình mạng từ query
  const devices = usbQuery.data?.devices || [];
  const events = usbQuery.data?.events || [];
  const summary = usbQuery.data?.summary || {};
  const networkInfo = usbQuery.data?.networkInfo || null;
  const isLoading = usbQuery.isLoading || usbQuery.isFetching;

  // Làm mới toàn bộ cache React Query thuộc nhánh ["usb"]
  const refreshData = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["usb"] });
  }, [queryClient]);

  /**
   * Phê duyệt nhanh một thiết bị USB vào danh sách tin cậy (Whitelist) và làm mới cache.
   */
  async function handleQuickApprove(device) {
    try {
      await updateUsbDevicePolicy(device._id, {
        status: "trusted",
        note: device.note || "Đã phê duyệt nhanh (Whitelisted) bởi bộ phận IT.",
      });
      toast.success(`Đã phê duyệt thiết bị USB "${device.deviceName}"!`);
      refreshData();
    } catch (error) {
      toast.error(
        error.response?.data?.message || "Phê duyệt thiết bị thất bại.",
      );
    }
  }

  /**
   * Đưa nhanh một thiết bị USB vào danh sách chặn (Blacklist) và làm mới cache.
   */
  async function handleQuickBlock(device) {
    try {
      await updateUsbDevicePolicy(device._id, {
        status: "blocked",
        note:
          device.note ||
          "Đã chặn (Blacklisted) do vi phạm chính sách bảo mật thiết bị ngoại vi.",
      });
      toast.warning(`Đã đưa "${device.deviceName}" vào danh sách chặn (Blacklist)!`);
      refreshData();
    } catch (error) {
      toast.error(error.response?.data?.message || "Chặn thiết bị thất bại.");
    }
  }

  /**
   * Giả lập gửi một sự kiện cắm thiết bị USB ngẫu nhiên như từ Agent thực tế để kiểm thử luồng cảnh báo realtime.
   */
  async function handleSimulateUsbEvent() {
    setIsSimulating(true);
    try {
      const randomSuffix = Math.floor(1000 + Math.random() * 9000);
      const samples = [
        {
          deviceName: `SanDisk Extreme Pro USB 3.2 128GB (#${randomSuffix})`,
          vendor: "SanDisk Corp (VID_0781)",
          deviceType: "storage",
          driveLetter: "F:",
          volumeName: `USB_DATA_${randomSuffix} (119.2 GB)`,
        },
        {
          deviceName: `Kingston DataTraveler Max 256GB (#${randomSuffix})`,
          vendor: "Kingston Technology (VID_0951)",
          deviceType: "storage",
          driveLetter: "G:",
          volumeName: `KINGSTON_${randomSuffix} (238.4 GB)`,
        },
        {
          deviceName: `WD My Passport Ultra 1TB (#${randomSuffix})`,
          vendor: "Western Digital (VID_1058)",
          deviceType: "storage",
          driveLetter: "E:",
          volumeName: `WD_BACKUP_${randomSuffix} (931.5 GB)`,
        },
      ];
      const pick = samples[randomSuffix % samples.length];

      await sendAgentUsbEvent({
        deviceId: `USBSTOR\\DISK&VEN_DEMO&PROD_USB\\SN${randomSuffix}`,
        deviceName: pick.deviceName,
        vendor: pick.vendor,
        serialNumber: `SN${randomSuffix}`,
        deviceType: pick.deviceType,
        driveLetter: pick.driveLetter,
        volumeName: pick.volumeName,
        eventType: "connected",
        hostname: `LAPTOP-NHANVIEN-${randomSuffix % 10 || 1}`,
        osUsername: `NhanVien_${randomSuffix % 10 || 1}`,
        ipAddress: networkInfo?.primaryLanIp || "192.168.1.25",
      });

      refreshData();
    } catch (error) {
      toast.error(
        error.response?.data?.message || "Không thể gửi sự kiện giả lập USB.",
      );
    } finally {
      setIsSimulating(false);
    }
  }

  /**
   * Xử lý xác nhận xóa thiết bị USB và toàn bộ nhật ký liên quan khỏi hệ thống, sau đó invalidate cache.
   */
  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteUsbDevice(deleteTarget._id);
      toast.success(`Đã xóa thiết bị "${deleteTarget.deviceName}" thành công.`);
      setDeleteTarget(null);
      refreshData();
    } catch (error) {
      toast.error(error.response?.data?.message || "Xóa thiết bị thất bại.");
    } finally {
      setIsDeleting(false);
    }
  }

  // Kiểm tra có bộ lọc nào đang kích hoạt để hiển thị nút "Xóa lọc"
  const isFilterActive = Boolean(
    search || statusFilter || deviceTypeFilter || connectionStateFilter,
  );

  /**
   * Đặt lại toàn bộ bộ lọc tìm kiếm USB về trạng thái mặc định.
   */
  function handleResetFilters() {
    setSearch("");
    setStatusFilter("");
    setDeviceTypeFilter("");
    setConnectionStateFilter("");
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      {/* Tiêu đề trang kèm nút làm mới và đường dẫn tải Agent cài đặt trên máy nhân viên */}
      <WorkspacePageHeader
        eyebrow="Endpoint Security & DLP • Realtime USB Monitoring"
        title="Giám Sát & Quản Lý Thiết Bị Ngoại Vi USB"
        description="Theo dõi thời gian thực mọi sự kiện nhân viên cắm/rút USB qua Agent .exe, phát cảnh báo tức thì cho Admin & Kỹ thuật viên và kiểm soát Whitelist / Blacklist."
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={refreshData}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-brand-bone bg-white text-xs font-semibold text-brand-slate hover:text-brand-ink hover:bg-brand-mist transition-colors shadow-2xs"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`}
              />
              <span className="hidden sm:inline">Làm mới</span>
            </button>
            <a
              href={getAgentDownloadUrl()}
              download="ITHelpdeskUSBAgent.exe"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-brand-violet text-white text-xs font-semibold hover:bg-purple-700 active:scale-95 transition-all shadow-sm"
            >
              <Download className="w-4 h-4" />
              <span>Tải Agent (.exe)</span>
            </a>
          </div>
        }
      />

      {/* Stat Cards */}
      {/* Lưới thẻ thống kê tổng số thiết bị USB theo chính sách và trạng thái kết nối */}
      <UsbStatsGrid summary={summary} />

      {/* Multi-machine & Agent .exe Banner */}
      {/* Banner hướng dẫn kết nối Agent qua mạng LAN và nút giả lập sự kiện USB */}
      <UsbAgentConnectionBanner
        networkInfo={networkInfo}
        onSimulateEvent={handleSimulateUsbEvent}
        isSimulating={isSimulating}
      />

      {/* Tabs & Filter Controls */}
      {/* Khung chứa Tab chuyển đổi (Thiết bị / Nhật ký) và thanh lọc tìm kiếm */}
      <div className="bg-white rounded-2xl border border-brand-bone p-4 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-brand-bone pb-3">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="devices">
                <Usb className="w-3.5 h-3.5" />
                <span>Danh Sách Thiết Bị USB ({devices.length})</span>
              </TabsTrigger>
              <TabsTrigger value="events">
                <Activity className="w-3.5 h-3.5" />
                <span>Nhật Ký Cắm / Rút Realtime ({events.length})</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Cảnh báo nổi bật khi phát hiện thiết bị USB mới chưa được phê duyệt */}
          {summary.unverifiedCount > 0 && (
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-xs font-semibold">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>
                Có {summary.unverifiedCount} thiết bị USB mới chưa được phê duyệt!
              </span>
            </div>
          )}
        </div>

        {/* Filter Bar */}
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-brand-ash" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm theo tên USB, hãng, Serial, tên máy nhân viên (Hostname), IP..."
              className="w-full text-xs rounded-xl border border-brand-bone pl-9 pr-3 py-2 bg-brand-mist/30 text-brand-onyx placeholder:text-brand-ash focus:bg-white focus:ring-2 focus:ring-brand-violet/20 focus:border-brand-violet outline-hidden transition-all"
            />
          </div>

          <div className="w-full md:w-48">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full text-xs rounded-xl border border-brand-bone px-3 py-2 bg-white text-brand-onyx focus:ring-2 focus:ring-brand-violet/20 focus:border-brand-violet outline-hidden"
            >
              <option value="">Tất cả chính sách</option>
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="w-full md:w-48">
            <select
              value={deviceTypeFilter}
              onChange={(e) => setDeviceTypeFilter(e.target.value)}
              className="w-full text-xs rounded-xl border border-brand-bone px-3 py-2 bg-white text-brand-onyx focus:ring-2 focus:ring-brand-violet/20 focus:border-brand-violet outline-hidden"
            >
              <option value="">Tất cả phân loại USB</option>
              {TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="w-full md:w-44">
            <select
              value={connectionStateFilter}
              onChange={(e) => setConnectionStateFilter(e.target.value)}
              className="w-full text-xs rounded-xl border border-brand-bone px-3 py-2 bg-white text-brand-onyx focus:ring-2 focus:ring-brand-violet/20 focus:border-brand-violet outline-hidden"
            >
              <option value="">Tất cả kết nối</option>
              <option value="connected">Đang cắm trên máy</option>
              <option value="disconnected">Đã rút ra</option>
            </select>
          </div>

          {isFilterActive && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-brand-bone text-brand-slate hover:bg-brand-mist text-xs font-medium transition-colors shrink-0"
            >
              <X className="w-3.5 h-3.5" />
              <span>Xóa lọc</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Content Table */}
      {/* Hiển thị bảng thiết bị USB hoặc bảng nhật ký sự kiện tùy theo tab đang chọn */}
      <div className="bg-white rounded-2xl border border-brand-bone shadow-xs overflow-hidden">
        {activeTab === "devices" ? (
          <UsbDevicesTable
            devices={devices}
            role={role}
            onQuickApprove={handleQuickApprove}
            onQuickBlock={handleQuickBlock}
            onEditPolicy={(dev) => setPolicyTarget(dev)}
            onDelete={(dev) => setDeleteTarget(dev)}
          />
        ) : (
          <UsbEventsTable events={events} />
        )}
      </div>

      {/* Modals */}
      {/* Modal cập nhật chính sách Whitelist/Blacklist và ghi chú cho thiết bị USB */}
      {policyTarget && (
        <UsbPolicyModal
          device={policyTarget}
          onClose={() => setPolicyTarget(null)}
          onSaved={() => {
            setPolicyTarget(null);
            refreshData();
          }}
        />
      )}

      {/* Modal xác nhận xóa thiết bị USB và nhật ký liên quan */}
      {deleteTarget && (
        <ConfirmActionModal
          title={`Xác Nhận Xóa Thiết Bị USB "${deleteTarget.deviceName}"?`}
          description="Hành động này sẽ xóa thiết bị USB và toàn bộ nhật ký cắm/rút liên quan khỏi hệ thống."
          confirmLabel="Xóa Thiết Bị"
          submitting={isDeleting}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={handleDeleteConfirm}
        />
      )}
    </div>
  );
}

export default UsbSecurityPage;
