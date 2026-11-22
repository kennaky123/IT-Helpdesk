/**
 * Khung thẻ chuẩn hóa bao bọc từng biểu đồ Recharts hoặc khối phân tích trên trang Dashboard.
 *
 * Props:
 * - titleId: ID dùng để liên kết thuộc tính aria-labelledby của <section> với tiêu đề <h2>.
 * - title: Tiêu đề của biểu đồ/báo cáo.
 * - description: Mô tả ngắn về chỉ số hoặc khoảng thời gian biểu đồ đang thể hiện.
 * - badge: Nhãn phụ dạng monospace hiển thị ở góc trên bên phải (tùy chọn).
 * - children: Nội dung biểu đồ (thường là các component bọc Recharts ResponsiveContainer).
 * - className: Lớp CSS bổ sung để điều chỉnh span cột trong CSS Grid (vd: "xl:col-span-2").
 *
 * Vai trò trong Dashboard (Recharts):
 * - Đảm bảo container cha có min-w-0 và overflow-hidden để ResponsiveContainer của Recharts
 *   tính toán lại kích thước chính xác trong layout Grid mà không gây tràn chiều ngang.
 */
import { motion } from "motion/react";

/**
 * Render card bọc biểu đồ với phần đầu (tiêu đề, mô tả, badge tùy chọn) và vùng nội dung co giãn an toàn.
 */
function DashboardChartCard({
  titleId,
  title,
  description,
  badge,
  children,
  className = "",
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className={`min-w-0 overflow-hidden rounded-2xl border border-brand-bone bg-white p-5 shadow-xs ${className}`}
      aria-labelledby={titleId}
    >
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h2
            id={titleId}
            className="font-display font-bold text-sm text-brand-onyx"
          >
            {title}
          </h2>
          <p className="text-xs text-brand-slate mt-0.5">{description}</p>
        </div>
        {badge ? (
          <span className="text-[11px] font-mono bg-brand-mist px-2 py-0.5 rounded border border-brand-bone text-brand-slate shrink-0">
            {badge}
          </span>
        ) : null}
      </div>
      <div className="min-w-0">{children}</div>
    </motion.section>
  );
}

export default DashboardChartCard;
