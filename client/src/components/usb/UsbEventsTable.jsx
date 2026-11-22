/**
 * @fileoverview Bảng nhật ký lịch sử các sự kiện cắm / rút USB theo thời gian thực (USB DLP Security).
 *
 * Mục đích & vai trò:
 * - Thuộc phân hệ USB DLP Security, ghi nhận dòng thời gian (audit log) mỗi khi nhân viên
 *   cắm hoặc rút thiết bị USB trên máy trạm cài Windows Agent.
 * - Hiển thị thời gian phát sinh, loại sự kiện (Cắm/Rút), thông tin thiết bị phần cứng,
 *   nhân viên chủ sở hữu máy trạm (`hostOwner` nếu tra khớp tài sản, hoặc fallback `hostname` / `osUsername`)
 *   và trạng thái chính sách an ninh của thiết bị tại thời điểm xảy ra sự kiện.
 *
 * Props:
 * - `events` {Array}: Danh sách bản ghi sự kiện cắm/rút USB từ backend.
 */
import {
  ArrowDownLeft,
  ArrowUpRight,
  Clock,
  HardDrive,
  Laptop,
  Usb,
  User,
} from "lucide-react";
import { formatTicketDateTime } from "../../utils/ticketPermissions.js";

// Cấu hình badge trạng thái an ninh của thiết bị USB tại thời điểm xảy ra sự kiện
const STATUS_BADGE = {
  trusted: {
    label: "Hợp lệ (Whitelisted)",
    cls: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  unverified: {
    label: "Chưa xác minh",
    cls: "bg-amber-50 text-amber-700 border-amber-200",
  },
  blocked: {
    label: "Bị chặn (Blacklisted)",
    cls: "bg-red-50 text-red-700 border-red-200",
  },
};

/**
 * Component bảng hiển thị nhật ký sự kiện cắm / rút thiết bị USB.
 */
function UsbEventsTable({ events = [] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="bg-brand-mist/60 text-[11px] font-bold text-brand-slate uppercase tracking-wider border-b border-brand-bone">
          <tr>
            <th className="py-3 px-4">Thời Gian</th>
            <th className="py-3 px-4">Sự Kiện</th>
            <th className="py-3 px-4">Thiết Bị Ngoại Vi USB</th>
            <th className="py-3 px-4">Máy Trạm Nhân Viên</th>
            <th className="py-3 px-4">Mức Độ An Ninh Lúc Cắm</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-brand-bone">
          {events.length === 0 ? (
            <tr>
              <td colSpan={5} className="py-12 text-center text-xs text-brand-slate">
                Chưa có sự kiện cắm / rút USB nào được ghi nhận.
              </td>
            </tr>
          ) : (
            events.map((evt) => {
              // Phân biệt sự kiện cắm vào hay rút ra và lấy badge trạng thái an ninh lúc cắm
              const isConnect = evt.eventType === "connected";
              const statusInfo =
                STATUS_BADGE[evt.deviceStatusAtEvent] || STATUS_BADGE.unverified;

              return (
                <tr
                  key={evt._id}
                  className="hover:bg-brand-mist/30 transition-colors"
                >
                  {/* Timestamp */}
                  <td className="py-3 px-4 whitespace-nowrap">
                    <div className="inline-flex items-center gap-1.5 text-xs font-mono text-brand-ink">
                      <Clock className="w-3.5 h-3.5 text-brand-ash" />
                      <span>{formatTicketDateTime(evt.createdAt)}</span>
                    </div>
                  </td>

                  {/* Event Type */}
                  <td className="py-3 px-4 whitespace-nowrap">
                    {isConnect ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-50 text-brand-violet border border-purple-200">
                        <ArrowDownLeft className="w-3.5 h-3.5" />
                        Cắm USB vào
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 text-brand-slate border border-gray-200">
                        <ArrowUpRight className="w-3.5 h-3.5" />
                        Rút USB ra
                      </span>
                    )}
                  </td>

                  {/* Device Info */}
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2.5">
                      <Usb className="w-4 h-4 text-brand-violet shrink-0" />
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-brand-onyx flex items-center gap-2">
                          <span>{evt.deviceName}</span>
                          {evt.driveLetter && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-brand-mist text-[10px] font-mono text-brand-ink border border-brand-bone">
                              <HardDrive className="w-2.5 h-2.5" />
                              {evt.driveLetter}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-brand-slate truncate max-w-[300px]">
                          {evt.vendor} • <span className="font-mono text-[10px]">{evt.deviceId}</span>
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Host Info */}
                  {/* Luồng hiển thị chủ sở hữu máy trạm: ưu tiên thông tin nhân viên từ hostOwner, fallback sang hostname & OS user */}
                  <td className="py-3 px-4">
                    {evt.hostOwner ? (
                      <div className="text-xs">
                        <div className="font-bold text-brand-onyx flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-brand-violet shrink-0" />
                          <span>{evt.hostOwner.fullName}</span>
                          {evt.hostOwner.department && (
                            <span className="text-[10px] font-medium text-brand-ash">
                              • {evt.hostOwner.department}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-brand-slate flex items-center gap-1 flex-wrap mt-0.5">
                          <Laptop className="w-3 h-3 text-brand-ash shrink-0" />
                          <span className="font-medium text-brand-ink">
                            {evt.hostOwner.assetTag
                              ? `${evt.hostOwner.assetTag} (${evt.hostname})`
                              : evt.hostname}
                          </span>
                          {evt.ipAddress && (
                            <span className="font-mono text-[10px] text-brand-ash">
                              ({evt.ipAddress})
                            </span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs">
                        <div className="font-bold text-brand-onyx flex items-center gap-1.5">
                          <Laptop className="w-3.5 h-3.5 text-brand-slate" />
                          <span>{evt.hostname}</span>
                        </div>
                        <div className="text-[11px] text-brand-slate">
                          User: <span className="font-medium text-brand-ink">{evt.osUsername || "N/A"}</span>
                          {evt.ipAddress && (
                            <span className="font-mono text-[10px] text-brand-ash ml-1.5">
                              ({evt.ipAddress})
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </td>

                  {/* Security Status */}
                  <td className="py-3 px-4">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${statusInfo.cls}`}
                    >
                      {statusInfo.label}
                    </span>
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

export default UsbEventsTable;

