/**
 * Giao diện khung xương (Skeleton Loading) mô phỏng bố cục trang Dashboard trong lúc chờ API tải xong.
 *
 * Props: Không nhận props.
 *
 * Vai trò trong Dashboard:
 * - Giữ nguyên cấu trúc 3 tầng của Dashboard (4 thẻ KPI -> 3 card biểu đồ -> bảng ticket & danh sách kỹ thuật viên)
 *   nhằm giảm hiện tượng nhảy layout (CLS) khi dữ liệu thật được render.
 */
// Danh sách khóa định danh cho 4 thẻ KPI ở hàng trên cùng.
const SUMMARY_SKELETONS = ["total", "pending", "processing", "completed"];
// Danh sách khóa định danh cho 3 khung biểu đồ (trong đó "trend" chiếm 2 cột trên màn hình xl).
const CHART_SKELETONS = ["trend", "status", "category"];

/**
 * Khối hình chữ nhật nhấp nháy đại diện cho một phần tử đang tải dữ liệu.
 */
function SkeletonBlock({ className }) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-slate-200 motion-reduce:animate-none ${className}`}
      aria-hidden="true"
    />
  );
}

/**
 * Render toàn bộ skeleton cho trang Dashboard với aria-busy và văn bản ẩn hỗ trợ trình đọc màn hình.
 */
function DashboardSkeleton() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Đang tải dữ liệu dashboard...</span>

      {/* Hàng 1: 4 thẻ KPI tổng quan */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {SUMMARY_SKELETONS.map((item) => (
          <div
            key={item}
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <SkeletonBlock className="h-4 w-28" />
            <SkeletonBlock className="mt-4 h-9 w-20" />
            <SkeletonBlock className="mt-3 h-3 w-36" />
          </div>
        ))}
      </div>

      {/* Hàng 2: 3 khung biểu đồ (biểu đồ xu hướng chiếm 2 cột trên xl) */}
      <div className="mt-6 grid min-w-0 gap-6 xl:grid-cols-2">
        {CHART_SKELETONS.map((item) => (
          <div
            key={item}
            className={[
              "min-w-0 rounded-xl border border-slate-200 bg-white p-5 shadow-sm",
              item === "trend" ? "xl:col-span-2" : "",
            ].join(" ")}
          >
            <SkeletonBlock className="h-5 w-44" />
            <SkeletonBlock className="mt-3 h-3 w-64 max-w-full" />
            <SkeletonBlock className="mt-6 h-64 w-full" />
          </div>
        ))}
      </div>

      {/* Hàng 3: Khung bảng ticket mới nhất và danh sách hiệu suất kỹ thuật viên */}
      <div className="mt-6 grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(20rem,0.6fr)]">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <SkeletonBlock className="h-5 w-36" />
          <div className="mt-6 space-y-4">
            {["ticket-1", "ticket-2", "ticket-3", "ticket-4", "ticket-5"].map(
              (item) => (
                <SkeletonBlock key={item} className="h-10 w-full" />
              ),
            )}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <SkeletonBlock className="h-5 w-48" />
          <div className="mt-6 space-y-4">
            {["tech-1", "tech-2", "tech-3", "tech-4"].map((item) => (
              <SkeletonBlock key={item} className="h-14 w-full" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default DashboardSkeleton;
