/**
 * @file TechnicianInProgressPage.jsx
 * @description Trang theo dõi các ticket đang được kỹ thuật viên thực hiện xử lý hoặc đang chờ phản hồi từ người dùng.
 * @role Technician (Kỹ thuật viên IT).
 * @flow Tái sử dụng `TechnicianTicketCollectionPage` với bộ lọc `["in_progress", "waiting_user"]` và nút thao tác "Cập nhật".
 */
import TechnicianTicketCollectionPage from "../../components/workspace/TechnicianTicketCollectionPage.jsx";

/**
 * Component trang "Ticket đang xử lý" của kỹ thuật viên.
 * Giúp kỹ thuật viên quản lý các ticket đang mở cần trao đổi thêm hoặc cập nhật giải pháp xử lý.
 */
function TechnicianInProgressPage() {
  // Render danh sách ticket đang xử lý hoặc chờ phản hồi thông qua component dùng chung của khu vực Technician
  return <TechnicianTicketCollectionPage title="Ticket đang xử lý" description="Theo dõi ticket đang thực hiện và các yêu cầu chờ người dùng phản hồi." statuses={["in_progress", "waiting_user"]} sourcePath="/technician/tickets/in-progress" actionLabel="Cập nhật" emptyMessage="Bạn không có ticket đang xử lý." />;
}
export default TechnicianInProgressPage;
