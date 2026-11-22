/**
 * @fileoverview Lưới thẻ thống kê tổng quan FinOps cho quản lý bản quyền phần mềm (Software FinOps).
 *
 * Mục đích & vai trò:
 * - Thuộc phân hệ Software FinOps, trình bày 4 chỉ số KPI tài chính & vận hành bản quyền:
 *   1. Ngân sách phần mềm định kỳ hàng tháng (VND).
 *   2. Hiệu suất sử dụng seat bản quyền (% đã cấp phát).
 *   3. Số lượng gói sắp hết hạn hoặc đã hết hạn cần gia hạn.
 *   4. Khoản tiết kiệm tiềm năng (chi phí lãng phí từ các seat đang bỏ trống).
 *
 * Props:
 * - `finOps` {Object}: Đối tượng thống kê tổng hợp từ backend (`monthlyTotalCost`, `wastedMonthlyCost`,
 *   `utilizationRate`, `assignedSeats`, `totalSeats`, `expiringSoonCount`, `expiredCount`, `unassignedSeats`).
 */
import { AlertTriangle, CreditCard, Layers, TrendingDown } from "lucide-react";
import WorkspaceStatCard from "../common/WorkspaceStatCard.jsx";
import { formatCurrencyVND } from "../../services/softwareService.js";

/**
 * Component hiển thị 4 thẻ thống kê FinOps trên đầu trang quản lý phần mềm.
 */
function SoftwareFinOpsSummary({ finOps = {} }) {
  // Quy đổi các chỉ số chi phí sang định dạng tiền tệ VND và chuỗi mô tả chi tiết
  const monthlyCost = formatCurrencyVND(finOps.monthlyTotalCost || 0);
  const wastedCost = formatCurrencyVND(finOps.wastedMonthlyCost || 0);
  const utilization = `${finOps.utilizationRate ?? 0}%`;
  const seatsDetail = `Đã cấp ${finOps.assignedSeats ?? 0}/${finOps.totalSeats ?? 0} seats`;
  // Cộng gộp số gói sắp tới hạn và đã quá hạn để cảnh báo người quản trị gia hạn kịp thời
  const expiringCount = Number(finOps.expiringSoonCount || 0) + Number(finOps.expiredCount || 0);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {/* Thẻ 1: Tổng ngân sách chi phí bản quyền mỗi tháng */}
      <WorkspaceStatCard
        icon={CreditCard}
        label="Ngân Sách Phần Mềm / Tháng"
        value={monthlyCost}
        description="Tổng chi phí định kỳ Microsoft, Adobe, SaaS..."
        tone="blue"
      />
      {/* Thẻ 2: Tỷ lệ seat đã cấp phát trên tổng số seat đã mua */}
      <WorkspaceStatCard
        icon={Layers}
        label="Hiệu Suất Sử Dụng Bản Quyền"
        value={utilization}
        description={seatsDetail}
        tone="emerald"
      />
      {/* Thẻ 3: Cảnh báo hợp đồng hết hạn hoặc sắp đến hạn gia hạn */}
      <WorkspaceStatCard
        icon={AlertTriangle}
        label="Sắp Hết Hạn / Cần Gia Hạn"
        value={expiringCount}
        description={
          finOps.expiredCount > 0
            ? `${finOps.expiredCount} gói đã hết hạn, ${finOps.expiringSoonCount} gói sắp tới hạn`
            : "Hợp đồng trong vòng 30 ngày tới"
        }
        tone={expiringCount > 0 ? "amber" : "blue"}
      />
      {/* Thẻ 4: Chi phí lãng phí có thể tối ưu từ các seat chưa gán */}
      <WorkspaceStatCard
        icon={TrendingDown}
        label="Tiết Kiệm Tiềm Năng (FinOps)"
        value={wastedCost}
        description={`Từ ${finOps.unassignedSeats ?? 0} seats chưa gán cho nhân viên`}
        tone="violet"
      />
    </div>
  );
}

export default SoftwareFinOpsSummary;

