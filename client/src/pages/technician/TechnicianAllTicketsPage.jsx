/**
 * @file TechnicianAllTicketsPage.jsx
 * @description Trang danh sách toàn bộ ticket trong hệ thống dành cho kỹ thuật viên, bao gồm cả các ticket mới chưa được phân công.
 * @role Technician (Kỹ thuật viên IT).
 * @flow Bọc component dùng chung `TechnicianTicketCollectionPage` với `statuses={[]}` (hiển thị tất cả trạng thái) để kỹ thuật viên tra cứu và chủ động tiếp nhận ticket.
 */
import TechnicianTicketCollectionPage from "../../components/workspace/TechnicianTicketCollectionPage.jsx";

/**
 * Component trang "Tất Cả Ticket Hệ Thống" của kỹ thuật viên.
 * Cấu hình bộ lọc mặc định lấy mọi trạng thái và gắn `sourcePath` để điều hướng chi tiết ticket đúng ngữ cảnh.
 */
function TechnicianAllTicketsPage() {
  return (
    <TechnicianTicketCollectionPage
      title="Tất Cả Ticket Hệ Thống"
      description="Xem toàn bộ yêu cầu trong hệ thống, bao gồm các ticket mới chưa phân công để chủ động tiếp nhận xử lý."
      statuses={[]}
      sourcePath="/technician/tickets/all"
      actionLabel="Chi tiết"
      emptyMessage="Không có ticket nào trong hệ thống."
    />
  );
}

export default TechnicianAllTicketsPage;

