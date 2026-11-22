/**
 * @fileoverview Lưới 4 thẻ thống kê tổng quan giám sát thiết bị USB (USB DLP Security).
 *
 * Mục đích & vai trò:
 * - Thuộc phân hệ USB DLP Security, hiển thị các chỉ số tóm tắt tình trạng an toàn cổng USB
 *   trên toàn hệ thống: thiết bị đang kết nối, USB lạ chưa xác minh, USB đã duyệt Whitelist
 *   và thiết bị bị chặn Blacklist kèm tổng số sự kiện/máy trạm.
 *
 * Props:
 * - `summary` {Object}: Dữ liệu tổng hợp từ API (`currentlyConnected`, `totalDevices`,
 *   `unverifiedCount`, `trustedCount`, `blockedCount`, `totalEvents`, `activeHostsCount`).
 */
import { AlertTriangle, CheckCircle2, ShieldAlert, Usb } from "lucide-react";
import WorkspaceStatCard from "../common/WorkspaceStatCard.jsx";

/**
 * Component hiển thị 4 thẻ KPI tổng quan USB DLP ở đầu trang quản lý USB.
 */
function UsbStatsGrid({ summary = {} }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {/* Thẻ 1: Số thiết bị USB đang cắm trực tiếp ở thời điểm hiện tại */}
      <WorkspaceStatCard
        icon={Usb}
        label="Thiết Bị Đang Kết Nối"
        value={summary.currentlyConnected ?? 0}
        description={`Trên tổng số ${summary.totalDevices ?? 0} USB đã ghi nhận`}
        tone="blue"
      />
      {/* Thẻ 2: Số USB mới phát hiện chưa xác minh (đổi sang màu amber để cảnh báo nếu > 0) */}
      <WorkspaceStatCard
        icon={AlertTriangle}
        label="USB Lạ Chưa Xác Minh"
        value={summary.unverifiedCount ?? 0}
        description="Cần Admin / Kỹ thuật viên kiểm tra & duyệt"
        tone={(summary.unverifiedCount ?? 0) > 0 ? "amber" : "blue"}
      />
      {/* Thẻ 3: Tổng số thiết bị đã được đưa vào danh sách tin cậy (Whitelist) */}
      <WorkspaceStatCard
        icon={CheckCircle2}
        label="USB Đã Phê Duyệt (Whitelist)"
        value={summary.trustedCount ?? 0}
        description="Thiết bị hợp lệ được phép sử dụng"
        tone="emerald"
      />
      {/* Thẻ 4: Tổng số thiết bị bị chặn (Blacklist) và thống kê sự kiện trên các máy trạm */}
      <WorkspaceStatCard
        icon={ShieldAlert}
        label="Thiết Bị Bị Chặn (Blacklist)"
        value={summary.blockedCount ?? 0}
        description={`Tổng ${summary.totalEvents ?? 0} sự kiện trên ${summary.activeHostsCount ?? 0} máy trạm`}
        tone="violet"
      />
    </div>
  );
}

export default UsbStatsGrid;

