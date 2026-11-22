/**
 * @file TicketDetailSkeleton.jsx
 * @description Component khung xương (loading skeleton) hiển thị trong lúc chờ tải dữ liệu chi tiết ticket lần đầu.
 *
 * Props: Không sử dụng props.
 *
 * Vai trò: Mô phỏng trước cấu trúc phần tiêu đề và bố cục lưới 2 cột (cột nội dung chính bên trái
 * và cột điều phối/metadata bên phải) nhằm tránh giật layout khi dữ liệu ticket chưa về tới.
 */

/**
 * Hiển thị placeholder hiệu ứng pulse thay thế tạm thời cho màn hình chi tiết ticket khi đang tải.
 */
function TicketDetailSkeleton() {
  return (
    <div className="animate-pulse" aria-label="Đang tải chi tiết ticket">
      {/* Khung placeholder cho thanh điều hướng, mã ticket, tiêu đề và các badge đầu trang */}
      <div className="h-11 w-36 rounded-lg bg-slate-200" />
      <div className="mt-5 h-4 w-40 rounded bg-slate-200" />
      <div className="mt-3 h-9 w-full max-w-2xl rounded bg-slate-200" />
      <div className="mt-4 flex gap-2">
        <div className="h-7 w-24 rounded-full bg-slate-200" />
        <div className="h-7 w-20 rounded-full bg-slate-200" />
      </div>
      {/* Khung placeholder bố cục 2 cột: trái (mô tả, đính kèm, trao đổi) - phải (metadata, thao tác) */}
      <div className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <div className="h-64 rounded-2xl bg-white ring-1 ring-slate-200" />
          <div className="h-48 rounded-2xl bg-white ring-1 ring-slate-200" />
          <div className="h-96 rounded-2xl bg-white ring-1 ring-slate-200" />
        </div>
        <div className="space-y-6">
          <div className="h-72 rounded-2xl bg-white ring-1 ring-slate-200" />
          <div className="h-80 rounded-2xl bg-white ring-1 ring-slate-200" />
        </div>
      </div>
    </div>
  );
}

export default TicketDetailSkeleton;
