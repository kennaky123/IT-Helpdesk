/**
 * @file UnauthorizedPage.jsx
 * @description Trang thông báo lỗi 403 khi người dùng truy cập vào đường dẫn không thuộc phạm vi phân quyền của vai trò hiện tại.
 * @role Tất cả người dùng đã đăng nhập (User / Technician / Admin) hoặc người dùng bị chặn bởi route guard.
 * @flow Lấy role hiện tại từ `useAuth()`, hiển thị thông báo lỗi 403 và cung cấp nút quay về trang tổng quan mặc định theo role (`getDefaultPathForRole`).
 */
import { ArrowLeft, ShieldAlert } from "lucide-react";
import { Link } from "react-router-dom";
import { getDefaultPathForRole } from "../constants/roles.js";
import useAuth from "../hooks/useAuth.js";

/**
 * Component hiển thị trang từ chối quyền truy cập (HTTP 403).
 * Điều hướng người dùng quay lại đúng không gian làm việc tương ứng với vai trò của họ.
 */
function UnauthorizedPage() {
  // Lấy thông tin tài khoản hiện tại để xác định role phục vụ điều hướng quay về trang tổng quan
  const { user } = useAuth();

  return (
    <section
      className="mx-auto flex min-h-[60vh] max-w-xl items-center justify-center"
      aria-labelledby="unauthorized-title"
    >
      {/* Thẻ thông báo lỗi phân quyền 403 và nút điều hướng về trang mặc định theo role */}
      <div className="w-full rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm sm:p-10">
        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-red-50 text-red-600">
          <ShieldAlert className="size-7" aria-hidden="true" />
        </div>
        <p className="mt-5 text-sm font-semibold text-red-600">Lỗi 403</p>
        <h1
          id="unauthorized-title"
          className="mt-2 text-2xl font-bold text-slate-900"
        >
          Bạn không có quyền truy cập
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Vai trò hiện tại không được phép mở trang này. Hãy quay lại khu vực làm
          việc phù hợp với tài khoản của bạn.
        </p>
        <Link
          to={getDefaultPathForRole(user?.role)}
          className="mt-6 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Về trang tổng quan
        </Link>
      </div>
    </section>
  );
}

export default UnauthorizedPage;
