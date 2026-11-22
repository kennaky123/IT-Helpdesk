import { Badge } from "../ui/badge.jsx";

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

function TicketStatusBadge({ status, label }) {
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

function TicketPriorityBadge({ priority, label }) {
  const presentation = PRIORITY_STYLES[priority] ?? {
    label: label || priority || "Không xác định",
    variant: "secondary",
    classes: "bg-slate-100 text-slate-600 border-slate-200 font-medium",
    dot: null,
  };

  return (
    <Badge variant={presentation.variant} className={presentation.classes}>
      {presentation.dot ? (
        <span className={presentation.dot} aria-hidden="true" />
      ) : null}
      {label || presentation.label}
    </Badge>
  );
}

export { TicketPriorityBadge, TicketStatusBadge };
