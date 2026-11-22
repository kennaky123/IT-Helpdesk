/**
 * @file UserTicketsPage.jsx
 * @description Trang danh sách và theo dõi toàn bộ ticket yêu cầu hỗ trợ mà người dùng hiện tại đã gửi.
 * @role User (Nhân viên nội bộ).
 * @flow Tái sử dụng component `TicketCollectionPage` để tìm kiếm, lọc, phân trang danh sách ticket của cá nhân và cung cấp nút "Tạo yêu cầu" chuyển đến `/user/tickets/new`.
 */
import { Plus } from "lucide-react";
import { Link } from "react-router-dom";
import TicketCollectionPage from "../../components/workspace/TicketCollectionPage.jsx";

/**
 * Component trang "Yêu cầu của tôi" dành cho người dùng nội bộ.
 * Truyền `headerAction` chứa nút điều hướng nhanh tới form tạo ticket mới.
 */
function UserTicketsPage() {
  return (
    <TicketCollectionPage
      eyebrow="Người dùng"
      title="Yêu cầu của tôi"
      description="Tìm kiếm, lọc và theo dõi toàn bộ yêu cầu hỗ trợ bạn đã gửi."
      actionLabel="Chi tiết"
      headerAction={
        <Link
          to="/user/tickets/new"
          className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#2563EB] px-4 text-sm font-semibold text-white hover:bg-blue-700"
        >
          <Plus className="size-4" />Tạo yêu cầu
        </Link>
      }
    />
  );
}

export default UserTicketsPage;
