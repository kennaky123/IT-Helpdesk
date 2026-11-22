/**
 * CreateTicketPageSkeleton.jsx
 *
 * Chức năng: Hiển thị giao diện khung xương (loading skeleton) cho trang tạo mới yêu cầu hỗ trợ (ticket).
 * Props: Không nhận props.
 * Vai trò: Duy trì cấu trúc bố cục trang tạo mới ticket (khối tiêu đề, khung biểu mẫu bên trái
 * và khung thông tin phụ bên phải trên màn hình `xl`) trong lúc chờ tải dữ liệu hoặc lazy component.
 */

// Component khung xương giữ chỗ cho toàn bộ bố cục trang tạo mới ticket
function CreateTicketPageSkeleton() {
  return (
    <div className="animate-pulse" aria-label="Đang tải trang tạo yêu cầu">
      {/* Placeholder phần breadcrumb và tiêu đề trang */}
      <div className="h-3 w-28 rounded bg-slate-200" />
      <div className="mt-3 h-9 w-64 max-w-full rounded bg-slate-200" />
      <div className="mt-3 h-5 w-full max-w-xl rounded bg-slate-200" />
      {/* Placeholder bố cục 2 cột: biểu mẫu chính bên trái và cột hướng dẫn bên phải trên desktop */}
      <div className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="space-y-6 rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
          <div className="h-11 rounded-lg bg-slate-100" />
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="h-11 rounded-lg bg-slate-100" />
            <div className="h-11 rounded-lg bg-slate-100" />
          </div>
          <div className="h-40 rounded-lg bg-slate-100" />
          <div className="h-36 rounded-xl bg-slate-100" />
        </div>
        <div className="hidden h-72 rounded-2xl bg-slate-100 xl:block" />
      </div>
    </div>
  );
}

export default CreateTicketPageSkeleton;
