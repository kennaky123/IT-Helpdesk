/**
 * @file TechnicianAssignedPage.jsx
 * @description Trang danh sách các ticket đã được Admin phân công cho kỹ thuật viên và đang chờ tiếp nhận xử lý.
 * @role Technician (Kỹ thuật viên IT).
 * @flow Tái sử dụng `TechnicianTicketCollectionPage` lọc cố định theo trạng thái `["assigned"]`, hiển thị nút "Tiếp nhận" để chuyển sang chi tiết ticket.
 */
import TechnicianTicketCollectionPage from "../../components/workspace/TechnicianTicketCollectionPage.jsx";

/**
 * Component trang "Ticket được phân công" dành cho kỹ thuật viên.
 * Truyền danh sách trạng thái `["assigned"]` và đường dẫn nguồn `/technician/tickets/assigned`.
 */
function TechnicianAssignedPage() {
  // Render danh sách ticket trạng thái assigned thông qua component dùng chung của khu vực Technician
  return <TechnicianTicketCollectionPage title="Ticket được phân công" description="Xem và tiếp nhận những yêu cầu admin đã phân công cho bạn." statuses={["assigned"]} sourcePath="/technician/tickets/assigned" actionLabel="Tiếp nhận" emptyMessage="Không có ticket mới được phân công." />;
}
export default TechnicianAssignedPage;
