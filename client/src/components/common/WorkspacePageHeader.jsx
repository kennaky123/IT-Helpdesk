/**
 * Phần đầu trang (Page Header) chuẩn hóa cho các không gian làm việc trong hệ thống IT Helpdesk.
 *
 * Props:
 * - eyebrow: Nhãn phân hệ ngắn hiển thị dạng Badge phía trên tiêu đề (vd: "CMDB", "FINOPS").
 * - title: Tiêu đề chính của trang hiện tại.
 * - description: Mô tả ngắn về phạm vi hoặc chức năng của trang.
 * - actions: React node tùy chọn chứa các nút thao tác nhanh đặt bên phải header.
 *
 * Vai trò trong UI Layout:
 * - Đảm bảo tính nhất quán về thị giác, phân cấp thông tin và hiệu ứng xuất hiện ở đầu các trang quản lý.
 */
import { motion } from "motion/react";
import { Badge } from "../ui/badge.jsx";

/**
 * Render khối tiêu đề trang kèm hiệu ứng trượt nhẹ (motion.header) và vùng nút hành động bên phải.
 */
function WorkspacePageHeader({ eyebrow, title, description, actions }) {
  return (
    <motion.header
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-brand-bone bg-white p-5 shadow-xs"
    >
      <div>
        <div className="mb-1 flex items-center gap-2">
          <Badge variant="violet" className="px-2 py-0.5 text-[10px] tracking-wider uppercase">
            {eyebrow}
          </Badge>
          <span className="text-xs text-brand-ash">• Đồng bộ trực tiếp</span>
        </div>
        <h1 className="font-display text-xl font-bold tracking-tight text-brand-onyx">
          {title}
        </h1>
        <p className="mt-0.5 max-w-3xl text-xs text-brand-slate">
          {description}
        </p>
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2.5">
          {actions}
        </div>
      ) : null}
    </motion.header>
  );
}

export default WorkspacePageHeader;
