/**
 * Khối hiển thị trạng thái trống cho các vùng biểu đồ khi chưa có dữ liệu thống kê.
 *
 * Props:
 * - message: Thông điệp giải thích cụ thể lý do biểu đồ chưa có dữ liệu (theo ngữ cảnh từng biểu đồ).
 *
 * Vai trò trong Dashboard (Recharts):
 * - Được các component biểu đồ Recharts render thay thế khi mảng dữ liệu rỗng hoặc toàn bộ giá trị bằng 0,
 *   giữ nguyên chiều cao h-64 để bố cục lưới Dashboard không bị co giật.
 */
import { ChartNoAxesColumn } from "lucide-react";

/**
 * Hiển thị hộp viền nét đứt với biểu tượng biểu đồ và thông báo chưa có dữ liệu.
 */
function ChartEmptyState({ message }) {
  return (
    <div className="flex h-64 flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 text-center">
      <span className="flex size-11 items-center justify-center rounded-full bg-white text-slate-400 shadow-sm">
        <ChartNoAxesColumn className="size-5" aria-hidden="true" />
      </span>
      <p className="mt-3 text-sm font-medium text-slate-700">
        Chưa có dữ liệu biểu đồ
      </p>
      <p className="mt-1 max-w-xs text-xs leading-5 text-slate-500">
        {message}
      </p>
    </div>
  );
}

export default ChartEmptyState;
