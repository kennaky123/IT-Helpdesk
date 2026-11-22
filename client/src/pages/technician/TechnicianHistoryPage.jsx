/**
 * @file TechnicianHistoryPage.jsx
 * @description Trang tra cứu lịch sử các ticket đã kết thúc quá trình xử lý (đã giải quyết, đã đóng hoặc đã hủy).
 * @role Technician (Kỹ thuật viên IT).
 * @flow Tái sử dụng `TechnicianTicketCollectionPage` lọc theo nhóm trạng thái hoàn tất `["resolved", "closed", "cancelled"]` với thao tác "Xem lại".
 */
import TechnicianTicketCollectionPage from "../../components/workspace/TechnicianTicketCollectionPage.jsx";

/**
 * Component trang "Lịch sử xử lý" dành cho kỹ thuật viên.
 * Cho phép xem lại nội dung giải pháp và kết quả SLA của các yêu cầu đã hoàn thành.
 */
function TechnicianHistoryPage() {
  // Render danh sách ticket lịch sử đã xử lý xong bằng component dùng chung của khu vực Technician
  return <TechnicianTicketCollectionPage title="Lịch sử xử lý" description="Tra cứu các yêu cầu đã hoàn thành, nội dung giải quyết và kết quả SLA." statuses={["resolved", "closed", "cancelled"]} sourcePath="/technician/history" actionLabel="Xem lại" emptyMessage="Chưa có lịch sử xử lý." />;
}
export default TechnicianHistoryPage;
