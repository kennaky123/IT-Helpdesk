/**
 * Bảng danh sách thiết bị IT (Assets) trong module quản lý tài sản.
 * Hiển thị thông tin phần cứng, trạng thái kho, nhân viên đang sử dụng, nút kết nối nhanh Remote Desktop (AnyDesk/TeamViewer)
 * và các thao tác vòng đời thiết bị (Cấp phát, Thu hồi, Cấu hình Remote, Xem lịch sử, Sửa, Xóa) theo phân quyền.
 *
 * Props:
 * - assets: Mảng danh sách thiết bị cần hiển thị (mặc định []).
 * - role: Vai trò người dùng hiện tại ("admin" | "technician" | "user", mặc định "admin").
 * - onAssign: Callback(asset) mở modal cấp phát thiết bị đang trong kho.
 * - onReturn: Callback(asset) mở modal thu hồi thiết bị đang sử dụng.
 * - onEdit: Callback(asset) mở modal chỉnh sửa thông tin thiết bị.
 * - onDelete: Callback(asset) xóa thiết bị (chỉ Admin và khi máy không đang sử dụng).
 * - onViewHistory: Callback(assetId) mở drawer lịch sử vòng đời thiết bị.
 * - onRemoteConnect: Callback(asset) mở modal cấu hình/kết nối Remote Desktop.
 */
import {
  ExternalLink,
  History,
  Laptop,
  Pencil,
  RotateCcw,
  Send,
  Trash2,
  Tv,
} from "lucide-react";
import { toast } from "react-toastify";
import { launchRemoteDesktop } from "../../services/assetService.js";

// Cấu hình nhãn hiển thị, lớp màu badge và chấm tròn cho từng trạng thái thiết bị
const STATUS_CONFIG = {
  in_stock: {
    label: "Trong Kho",
    badge: "bg-emerald-50 text-emerald-700 border-emerald-200",
    dot: "bg-emerald-500",
  },
  in_use: {
    label: "Đang Sử Dụng",
    badge: "bg-purple-50 text-brand-violet border-purple-200",
    dot: "bg-brand-violet",
  },
  maintenance: {
    label: "Đang Bảo Trì",
    badge: "bg-amber-50 text-amber-700 border-amber-200",
    dot: "bg-amber-500",
  },
  retired: {
    label: "Ngưng Sử Dụng",
    badge: "bg-gray-50 text-gray-600 border-gray-200",
    dot: "bg-gray-400",
  },
};

// Bảng ánh xạ mã loại thiết bị sang tên hiển thị ngắn gọn
const TYPE_LABELS = {
  laptop: "Laptop",
  desktop: "Desktop",
  monitor: "Màn hình",
  accessory: "Phụ kiện",
  other: "Khác",
};

/**
 * Component bảng hiển thị danh sách tài sản thiết bị IT và thao tác tương ứng.
 */
function AssetsTable({
  assets = [],
  role = "admin",
  onAssign,
  onReturn,
  onEdit,
  onDelete,
  onViewHistory,
  onRemoteConnect,
}) {
  // Handler mở nhanh phần mềm Remote Desktop (AnyDesk/TeamViewer) và copy ID vào clipboard
  async function handleQuickLaunch(asset, e) {
    e.stopPropagation();
    // Nếu thiết bị chưa được cấu hình remoteId thì mở modal để nhập mã trước
    if (!asset.remoteId) {
      onRemoteConnect?.(asset);
      return;
    }
    try {
      // Sao chép ID và kích hoạt URL protocol mở ứng dụng điều khiển từ xa
      const { appName, id } = await launchRemoteDesktop(
        asset.remoteTool,
        asset.remoteId,
      );
      toast.success(
        `Đã sao chép ID ${id} và mở liên kết ${appName}!`,
      );
    } catch (error) {
      toast.error(error.message || "Không thể mở ứng dụng Remote Desktop.");
    }
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="bg-brand-mist/60 text-[11px] font-bold text-brand-slate uppercase tracking-wider border-b border-brand-bone">
          <tr>
            <th className="py-3 px-4">Mã & Thiết Bị</th>
            <th className="py-3 px-4">Loại</th>
            <th className="py-3 px-4">Trạng Thái & Tag</th>
            <th className="py-3 px-4">Người Đang Sử Dụng</th>
            <th className="py-3 px-4">Remote Desktop</th>
            <th className="py-3 px-4 text-right">Thao Tác</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-brand-bone">
          {assets.length === 0 ? (
            <tr>
              <td colSpan={6} className="py-12 text-center text-xs text-brand-slate">
                Không tìm thấy thiết bị nào phù hợp với bộ lọc.
              </td>
            </tr>
          ) : (
            assets.map((asset) => {
              // Tra cứu cấu hình badge trạng thái và kiểm tra thiết bị đã cấp cho nhân viên chưa
              const statusCfg = STATUS_CONFIG[asset.status] || STATUS_CONFIG.in_stock;
              const isAssigned = asset.status === "in_use" && asset.assignedTo;

              return (
                <tr
                  key={asset._id}
                  className="hover:bg-brand-mist/40 transition-colors group"
                >
                  {/* Mã & Thiết Bị */}
                  <td className="py-3 px-4">
                    <div className="flex items-start gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-purple-50 text-brand-violet border border-purple-100">
                        <Laptop className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-xs px-2 py-0.5 rounded-md bg-purple-100/70 text-brand-violet">
                            {asset.assetTag}
                          </span>
                          <span className="font-bold text-brand-onyx truncate text-sm">
                            {asset.name}
                          </span>
                        </div>
                        <div className="text-[11px] text-brand-slate truncate mt-0.5">
                          {asset.specs || "Chưa cấu hình chi tiết"}
                          {asset.os ? ` • ${asset.os}` : ""}
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Loại */}
                  <td className="py-3 px-4">
                    <span className="text-xs font-semibold text-brand-slate">
                      {TYPE_LABELS[asset.type] || asset.type}
                    </span>
                  </td>

                  {/* Trạng Thái & Tag */}
                  <td className="py-3 px-4">
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border shadow-2xs">
                      <span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dot}`} />
                      <span className={statusCfg.badge.split(" ")[1]}>
                        {statusCfg.label}
                      </span>
                    </div>
                  </td>

                  {/* Người Đang Sử Dụng */}
                  <td className="py-3 px-4">
                    {isAssigned ? (
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-violet text-[11px] font-bold text-white">
                          {asset.assignedTo.fullName?.slice(0, 2).toUpperCase() || "NV"}
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-brand-ink truncate">
                            {asset.assignedTo.fullName}
                          </div>
                          <div className="text-[10px] text-brand-slate truncate">
                            {asset.assignedTo.department || asset.assignedTo.email}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <span className="text-xs text-brand-ash italic">
                        Trong kho lưu trữ
                      </span>
                    )}
                  </td>

                  {/* Remote Desktop */}
                  <td className="py-3 px-4">
                    {asset.remoteTool && asset.remoteTool !== "none" ? (
                      <div className="flex items-center gap-1.5">
                        {/* Chỉ Admin/KTV được bấm mở nhanh Remote Desktop; User chỉ xem ID */}
                        {role !== "user" ? (
                          <button
                            type="button"
                            onClick={(e) => handleQuickLaunch(asset, e)}
                            title={`Bấm để mở trực tiếp qua ${asset.remoteTool.toUpperCase()}`}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition-all shadow-2xs ${
                              asset.remoteTool === "anydesk"
                                ? "bg-red-50 text-red-700 hover:bg-red-100 border border-red-200"
                                : "bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200"
                            }`}
                          >
                            <span
                              className={`w-2 h-2 rounded-full ${
                                asset.remoteTool === "anydesk"
                                  ? "bg-red-500"
                                  : "bg-blue-500"
                              }`}
                            />
                            <span className="uppercase">{asset.remoteTool}:</span>
                            <span>{asset.remoteId || "Chưa có ID"}</span>
                            <ExternalLink className="w-3 h-3 ml-0.5 opacity-70" />
                          </button>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-mono font-semibold bg-brand-mist text-brand-slate border border-brand-bone">
                            <span className="uppercase">{asset.remoteTool}:</span>
                            <span>{asset.remoteId || "Chưa có ID"}</span>
                          </span>
                        )}
                      </div>
                    ) : role !== "user" ? (
                      <button
                        type="button"
                        onClick={() => onRemoteConnect?.(asset)}
                        className="text-[11px] text-brand-ash hover:text-brand-violet underline"
                      >
                        + Cài đặt Remote ID
                      </button>
                    ) : (
                      <span className="text-xs text-brand-ash italic">
                        Chưa cài đặt
                      </span>
                    )}
                  </td>

                  {/* Thao Tác */}
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {/* Cấp phát nếu trong kho */}
                      {asset.status === "in_stock" && role !== "user" && (
                        <button
                          type="button"
                          onClick={() => onAssign?.(asset)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-brand-violet text-white text-xs font-bold hover:bg-purple-700 transition-colors shadow-2xs"
                        >
                          <Send className="w-3 h-3" />
                          Cấp Phát
                        </button>
                      )}

                      {/* Thu hồi nếu đang sử dụng */}
                      {asset.status === "in_use" && role !== "user" && (
                        <button
                          type="button"
                          onClick={() => onReturn?.(asset)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-50 text-amber-800 border border-amber-200 text-xs font-bold hover:bg-amber-100 transition-colors shadow-2xs"
                        >
                          <RotateCcw className="w-3 h-3 text-amber-600" />
                          Thu Hồi
                        </button>
                      )}

                      {/* Remote Desktop (Admin/Tech only) */}
                      {role !== "user" && (
                        <button
                          type="button"
                          onClick={() => onRemoteConnect?.(asset)}
                          title="Kết nối / Đổi mã Remote Desktop"
                          className="p-1.5 rounded-lg text-brand-slate hover:text-brand-ink hover:bg-brand-mist transition-colors"
                        >
                          <Tv className="w-4 h-4 text-brand-violet" />
                        </button>
                      )}

                      {/* Xem lịch sử vòng đời thiết bị */}
                      <button
                        type="button"
                        onClick={() => onViewHistory?.(asset._id)}
                        title="Xem lịch sử thiết bị"
                        className="p-1.5 rounded-lg text-brand-slate hover:text-brand-ink hover:bg-brand-mist transition-colors"
                      >
                        <History className="w-4 h-4" />
                      </button>

                      {/* Chỉnh sửa thông tin thiết bị (Admin/Tech) */}
                      {role !== "user" && (
                        <button
                          type="button"
                          onClick={() => onEdit?.(asset)}
                          title="Sửa thông tin"
                          className="p-1.5 rounded-lg text-brand-slate hover:text-brand-ink hover:bg-brand-mist transition-colors"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                      )}

                      {/* Xóa thiết bị (chỉ Admin và chỉ khi thiết bị không đang được sử dụng) */}
                      {role === "admin" && asset.status !== "in_use" && (
                        <button
                          type="button"
                          onClick={() => onDelete?.(asset)}
                          title="Xóa thiết bị"
                          className="p-1.5 rounded-lg text-red-500 hover:text-red-700 hover:bg-red-50 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

export default AssetsTable;
