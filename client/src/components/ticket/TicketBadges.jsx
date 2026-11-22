/**
 * TicketBadges.jsx
 *
 * Chức năng: Cung cấp các component badge trực quan hiển thị trạng thái xử lý
 * (`TicketStatusBadge`) và mức độ ưu tiên (`TicketPriorityBadge`) của ticket.
 * Props:
 * - TicketStatusBadge: `status` (mã trạng thái từ backend), `label` (nhãn tùy chỉnh ghi đè nếu có).
 * - TicketPriorityBadge: `priority` (mã mức độ ưu tiên: urgent/high/medium/low), `label` (nhãn tùy chỉnh nếu có).
 * Vai trò: Đảm bảo tính nhất quán màu sắc, nhãn tiếng Việt và cảnh báo trực quan SLA
 * (như chấm nhấp nháy P1) xuyên suốt danh sách và trang chi tiết ticket.
 */
import { Badge } from "../ui/badge.jsx";

// Bảng ánh xạ mã trạng thái ticket sang nhãn tiếng Việt, biến thể màu badge và lớp CSS bổ sung
const STATUS_STYLES = {
  pending: {
    label: "Mới Tiếp Nhận",
    variant: "blue",
    classes: "bg-brand-mist border-brand-blue/30",
  },
  assigned: {
    label: "Đã Phân Công",
    variant: "blue",
    classes: "",
  },
  in_progress: {
    label: "Đang Xử Lý",
    variant: "violet",
    classes: "",
  },
  waiting_user: {
    label: "Chờ User",
    variant: "secondary",
    classes: "border-dashed border-brand-ash font-medium",
  },
  resolved: {
    label: "Đã Xong",
    variant: "emerald",
    classes: "",
  },
  closed: {
    label: "Đã Đóng",
    variant: "secondary",
    classes: "bg-slate-100 text-slate-700 border-slate-200",
  },
  cancelled: {
    label: "Đã Hủy",
    variant: "destructive",
    classes: "",
  },
};

// Bảng ánh xạ mức độ ưu tiên ticket sang nhãn P1–P4, màu sắc và chấm tròn chỉ báo mức khẩn cấp (`pulse-sla` cho P1)
const PRIORITY_STYLES = {
  urgent: {
    label: "P1 - Khẩn Cấp",
    variant: "destructive",
    classes: "bg-red-100",
    dot: "w-1.5 h-1.5 rounded-full bg-red-600 pulse-sla",
  },
  high: {
    label: "P2 - Cao",
    variant: "orange",
    classes: "",
    dot: "w-1.5 h-1.5 rounded-full bg-orange-600",
  },
  medium: {
    label: "P3 - Vừa",
    variant: "amber",
    classes: "bg-yellow-100 text-yellow-800 border-yellow-200 font-medium",
    dot: null,
  },
  low: {
    label: "P4 - Thấp",
    variant: "secondary",
    classes: "bg-slate-100 text-slate-600 border-slate-200 font-medium",
    dot: null,
  },
};

// Component hiển thị badge trạng thái ticket; tự fallback sang nhãn mặc định nếu gặp mã trạng thái chưa định nghĩa
function TicketStatusBadge({ status, label }) {
  // Tra cứu cấu hình giao diện theo `status`, dùng cấu hình phụ nếu không khớp khóa nào
  const presentation = STATUS_STYLES[status] ?? {
    label: label || status || "Không xác định",
    variant: "secondary",
    classes: "font-medium",
  };

  return (
    <Badge variant={presentation.variant} className={presentation.classes}>
      {label || presentation.label}
    </Badge>
  );
}

// Component hiển thị badge mức độ ưu tiên ticket kèm chấm chỉ báo (dot) cho P1/P2
function TicketPriorityBadge({ priority, label }) {
  // Tra cứu cấu hình giao diện theo `priority`, fallback về kiểu xám trung tính nếu chưa xác định
  const presentation = PRIORITY_STYLES[priority] ?? {
    label: label || priority || "Không xác định",
    variant: "secondary",
    classes: "bg-slate-100 text-slate-600 border-slate-200 font-medium",
    dot: null,
  };

  return (
    <Badge variant={presentation.variant} className={presentation.classes}>
      {/* Hiển thị chấm tròn nhấn mạnh mức độ khẩn cấp/cao nếu cấu hình có định nghĩa `dot` */}
      {presentation.dot ? (
        <span className={presentation.dot} aria-hidden="true" />
      ) : null}
      {label || presentation.label}
    </Badge>
  );
}

export { TicketPriorityBadge, TicketStatusBadge };
