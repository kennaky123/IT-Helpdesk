/**
 * Ngăn kéo trượt bên phải (Drawer) hiển thị lịch sử vòng đời của một thiết bị IT trong module quản lý tài sản (Asset).
 * Tải chi tiết thiết bị theo assetId và hiển thị dòng thời gian các sự kiện nhập kho, cấp phát, thu hồi, đổi trạng thái, cập nhật.
 *
 * Props:
 * - assetId: ID của thiết bị cần tra cứu lịch sử.
 * - onClose: Callback đóng drawer.
 */
import { useEffect, useState } from "react";
import { Clock, History, User, X } from "lucide-react";
import { toast } from "react-toastify";
import { getAsset } from "../../services/assetService.js";
import { formatTicketDateTime } from "../../utils/ticketPermissions.js";

// Ánh xạ mã hành động lịch sử thiết bị sang nhãn tiếng Việt và lớp màu badge
const ACTION_LABELS = {
  created: { text: "Nhập kho mới", color: "bg-blue-100 text-brand-blue" },
  assigned: { text: "Cấp phát cho nhân viên", color: "bg-purple-100 text-brand-violet" },
  returned: { text: "Thu hồi về kho", color: "bg-amber-100 text-amber-700" },
  status_changed: { text: "Đổi trạng thái", color: "bg-slate-100 text-brand-slate" },
  updated: { text: "Cập nhật cấu hình", color: "bg-gray-100 text-brand-slate" },
};

/**
 * Component drawer xem lịch sử biến động và sử dụng thiết bị.
 */
function AssetHistoryDrawer({ assetId, onClose }) {
  // State lưu chi tiết thiết bị (kèm mảng history) và trạng thái tải API
  const [asset, setAsset] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // Effect gọi API lấy chi tiết thiết bị và lịch sử theo assetId, hỗ trợ hủy request khi unmount
  useEffect(() => {
    const controller = new AbortController();
    getAsset(assetId, { signal: controller.signal })
      .then(setAsset)
      .catch((error) => {
        if (error.code !== "ERR_CANCELED") {
          toast.error("Không thể tải lịch sử thiết bị.");
        }
      })
      .finally(() => setIsLoading(false));

    return () => controller.abort();
  }, [assetId]);

  return (
    <div
      onClick={(e) => {
        // Đóng drawer khi click ra vùng nền tối bên ngoài
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs animate-in fade-in"
    >
      <div className="w-full max-w-md bg-white h-full shadow-2xl flex flex-col border-l border-brand-bone animate-in slide-in-from-right duration-200">
        {/* Đầu drawer hiển thị tên và mã Asset Tag của thiết bị */}
        <div className="flex items-center justify-between p-5 border-b border-brand-bone bg-brand-mist/50 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-100 text-brand-violet">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-brand-onyx">
                Lịch Sử Vòng Đời Thiết Bị
              </h2>
              <p className="text-xs text-brand-slate">
                {asset ? `${asset.name} (${asset.assetTag})` : "Đang tải..."}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-brand-slate hover:text-brand-ink hover:bg-brand-mist transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Thân drawer hiển thị trạng thái tải, rỗng hoặc dòng thời gian lịch sử */}
        <div className="p-5 flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-xs text-brand-slate">
              Đang tải lịch sử...
            </div>
          ) : !asset?.history || asset.history.length === 0 ? (
            <div className="text-center py-12 text-xs text-brand-slate">
              Chưa có lịch sử ghi nhận cho thiết bị này.
            </div>
          ) : (
            <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-brand-bone">
              {/* Đảo ngược bản sao mảng history để hiển thị mốc thời gian mới nhất lên trên cùng */}
              {asset.history
                .slice()
                .reverse()
                .map((entry, index) => {
                  const meta = ACTION_LABELS[entry.action] || {
                    text: entry.action,
                    color: "bg-gray-100 text-brand-slate",
                  };
                  return (
                    <div key={entry._id || index} className="relative">
                      <span className="absolute -left-[27px] top-1 w-3 h-3 rounded-full border-2 border-white bg-brand-violet ring-2 ring-purple-100" />
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${meta.color}`}
                          >
                            {meta.text}
                          </span>
                          <time className="text-[11px] font-mono text-brand-ash">
                            {formatTicketDateTime(entry.at)}
                          </time>
                        </div>
                        {entry.user && (
                          <div className="text-xs text-brand-ink font-semibold flex items-center gap-1.5 pt-0.5">
                            <User className="w-3.5 h-3.5 text-brand-violet" />
                            Nhân viên: {entry.user.fullName}
                          </div>
                        )}
                        {entry.note && (
                          <p className="text-xs text-brand-slate bg-brand-mist/50 rounded-lg p-2.5 border border-brand-bone">
                            {entry.note}
                          </p>
                        )}
                        <div className="text-[11px] text-brand-ash">
                          Thực hiện bởi: {entry.performedBy?.fullName || "Hệ thống"} ({entry.performedBy?.role || "IT"})
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default AssetHistoryDrawer;

