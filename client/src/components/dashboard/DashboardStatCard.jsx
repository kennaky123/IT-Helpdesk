/**
 * Thẻ hiển thị chỉ số KPI chính ở phần đầu trang Dashboard Quản trị & BI.
 *
 * Props:
 * - icon: Component icon từ lucide-react hiển thị ở góc trên bên phải.
 * - label: Tiêu đề ngắn mô tả chỉ số (vd: "Tổng ticket", "Chờ tiếp nhận").
 * - value: Giá trị thống kê chính đã được định dạng.
 * - description: Dòng chú giải hoặc tỷ lệ bổ sung bên dưới con số chính.
 * - tone: Khóa chọn bảng màu ("blue" | "amber" | "violet" | "emerald").
 *
 * Vai trò trong Dashboard:
 * - Trình bày các số liệu tổng quan nhanh ở tầng trên cùng của Dashboard trước các biểu đồ Recharts.
 */
import { motion } from "motion/react";

// Bảng cấu hình cặp class màu cho khung icon và dòng mô tả phụ tương ứng theo từng tông màu.
const TONE_CLASSES = {
  blue: {
    icon: "bg-blue-50 text-brand-blue",
    badge: "text-brand-blue",
  },
  amber: {
    icon: "bg-amber-50 text-amber-600",
    badge: "text-amber-600",
  },
  violet: {
    icon: "bg-purple-50 text-brand-violet",
    badge: "text-brand-violet",
  },
  emerald: {
    icon: "bg-emerald-50 text-emerald-600",
    badge: "text-emerald-600",
  },
};

/**
 * Render thẻ KPI trên Dashboard với màu nhấn đồng bộ giữa biểu tượng và mô tả, fallback về tông "blue".
 */
function DashboardStatCard({ icon: Icon, label, value, description, tone }) {
  // Lấy bộ class màu theo tone; dùng màu xanh dương làm mặc định nếu truyền tone không hợp lệ.
  const toneClasses = TONE_CLASSES[tone] ?? TONE_CLASSES.blue;

  return (
    <motion.article
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="bg-white p-5 rounded-2xl border border-brand-bone shadow-xs"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-brand-slate">{label}</span>
        <span
          className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${toneClasses.icon}`}
        >
          <Icon className="w-4 h-4" aria-hidden="true" />
        </span>
      </div>
      <div className="text-2xl font-display font-extrabold text-brand-onyx">
        {value}
      </div>
      <div className={`text-[11px] font-medium mt-1 ${toneClasses.badge}`}>
        {description}
      </div>
    </motion.article>
  );
}

export default DashboardStatCard;
