/**
 * Trang Báo Cáo Hiệu Suất & Tài Sản CMDB (Admin Reports).
 *
 * Vai trò trong hệ thống IT Helpdesk:
 * - Cung cấp góc nhìn phân tích chuyên sâu cho quản trị viên dựa trên dữ liệu thực tế từ PostgreSQL:
 *   + So sánh lưu lượng ticket phát sinh mới và đã giải quyết trong 7 ngày gần nhất.
 *   + Cơ cấu phân bổ sự cố theo danh mục dịch vụ (PieChart).
 *   + Thống kê tình trạng phân bổ tài sản thiết bị CNTT (CMDB: đang dùng, trong kho, bảo trì).
 *   + Bảng đánh giá khối lượng công việc và hiệu suất hoàn thành của từng kỹ thuật viên.
 * - Cho phép xuất báo cáo lưu lượng 7 ngày ra tệp CSV để lưu trữ hoặc báo cáo định kỳ.
 */
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Clock3, Download, Gauge, Ticket } from "lucide-react";
import { useMemo } from "react";
import { toast } from "react-toastify";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import WorkspacePageHeader from "../../components/common/WorkspacePageHeader.jsx";
import WorkspaceStatCard from "../../components/common/WorkspaceStatCard.jsx";
import DashboardErrorState from "../../components/dashboard/DashboardErrorState.jsx";
import DashboardSkeleton from "../../components/dashboard/DashboardSkeleton.jsx";
import { Button } from "../../components/ui/button.jsx";
import useAdminDashboard from "../../hooks/useAdminDashboard.js";
import { getAssets } from "../../services/assetService.js";
import { getDashboardErrorMessage } from "../../services/dashboardService.js";

// Bảng màu xoay vòng áp dụng cho các lát cắt của biểu đồ cơ cấu danh mục sự cố
const COLORS = [
  "#6647f0",
  "#0091ff",
  "#00c07a",
  "#f59e0b",
  "#ef4444",
  "#646464",
];

// Ánh xạ mã loại thiết bị CMDB sang nhãn tiếng Việt dễ đọc trong bảng thống kê
const ASSET_TYPE_LABELS = {
  laptop: "Laptop / Máy tính xách tay",
  desktop: "PC / Workstation",
  monitor: "Màn hình",
  printer: "Máy in / Scan",
  network: "Thiết bị mạng",
  other: "Thiết bị khác",
};

/**
 * Component chính của trang Báo cáo hiệu suất & Tài sản CMDB.
 * Kết hợp dữ liệu thống kê ticket từ useAdminDashboard với dữ liệu danh mục thiết bị từ assetService.
 */
function AdminReportsPage() {
  // Luồng lấy dữ liệu 1: truy vấn dữ liệu tổng hợp ticket và hiệu suất kỹ thuật viên
  const { data, error, isLoading, refetch } = useAdminDashboard();
  // Luồng lấy dữ liệu 2: truy vấn danh sách thiết bị CMDB để tổng hợp phân bổ tài sản theo loại
  const { data: assetData } = useQuery({
    queryKey: ["assets", "report-summary"],
    queryFn: ({ signal }) => getAssets({}, { signal }),
  });

  // Tổng hợp và nhóm số lượng thiết bị theo loại (tổng, đang cấp phát, sẵn sàng trong kho, bảo trì)
  const assetBreakdown = useMemo(() => {
    const groups = new Map();
    for (const asset of assetData?.assets ?? []) {
      const key = asset.type || "other";
      const current = groups.get(key) ?? {
        key,
        label: ASSET_TYPE_LABELS[key] ?? key,
        total: 0,
        assigned: 0,
        available: 0,
        maintenance: 0,
      };
      current.total += 1;
      if (asset.status === "assigned") current.assigned += 1;
      else if (asset.status === "in_stock" || asset.status === "available") current.available += 1;
      else current.maintenance += 1;
      groups.set(key, current);
    }
    return Array.from(groups.values());
  }, [assetData?.assets]);

  // Ghép dữ liệu số ticket tạo mới và đã hoàn thành theo từng ngày trong 7 ngày gần nhất
  const weekly = (data?.charts.ticketsCreatedLast7Days ?? []).map(
    (item, index) => ({
      day: item.name,
      created: item.value,
      resolved: data?.charts.ticketsResolvedLast7Days?.[index]?.value ?? 0,
    }),
  );
  // Dữ liệu cơ cấu danh mục và hiệu suất kỹ thuật viên từ payload dashboard
  const categories = data?.charts.ticketsByCategory ?? [];
  const technicians = data?.charts.technicianPerformance ?? [];

  /**
   * Xuất bảng thống kê đối chiếu ticket tạo mới và hoàn thành trong 7 ngày ra file CSV (UTF-8 BOM).
   */
  function exportReport() {
    const rows = [
      "Ngày,Ticket tạo mới,Ticket hoàn thành",
      ...weekly.map((item) => `${item.day},${item.created},${item.resolved}`),
    ];
    const url = URL.createObjectURL(
      new Blob([`\uFEFF${rows.join("\n")}`], {
        type: "text/csv;charset=utf-8",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "bao-cao-it-helpdesk.csv";
    link.click();
    URL.revokeObjectURL(url);
    toast.success("Đã xuất báo cáo thống kê CSV.");
  }

  return (
    <section>
      {/* Phần tiêu đề trang và nút xuất báo cáo CSV */}
      <WorkspacePageHeader
        eyebrow="Báo cáo & Phân tích vận hành"
        title="Báo cáo hiệu suất & Tài sản CMDB"
        description="Tổng hợp số liệu thực tế từ hệ thống ticket, hiệu suất kỹ thuật viên và tình trạng phân bổ thiết bị."
        actions={
          <Button type="button" size="pill" onClick={exportReport}>
            <Download className="size-3.5" />
            Xuất Báo Cáo CSV
          </Button>
        }
      />
      {/* Hiển thị skeleton trong khi chờ dữ liệu tổng hợp */}
      {isLoading ? <DashboardSkeleton /> : null}
      {/* Hiển thị giao diện báo lỗi và nút thử lại nếu truy vấn thất bại */}
      {!isLoading && error ? (
        <DashboardErrorState
          message={getDashboardErrorMessage(error)}
          onRetry={refetch}
        />
      ) : null}
      {/* Hiển thị nội dung báo cáo khi đã tải xong dữ liệu */}
      {!isLoading && data ? (
        <>
          {/* Hàng thẻ thống kê 4 chỉ số vận hành ticket chính */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <WorkspaceStatCard
              icon={Ticket}
              label="Ticket tiếp nhận"
              value={data.summary.totalTickets}
              description="Tổng ticket trong hệ thống"
            />
            <WorkspaceStatCard
              icon={CheckCircle2}
              label="Đã hoàn thành"
              value={data.summary.completedTickets}
              description="Đã giải quyết hoặc đóng"
              tone="emerald"
            />
            <WorkspaceStatCard
              icon={Clock3}
              label="Đang xử lý"
              value={data.summary.processingTickets}
              description="Đã phân công, đang xử lý hoặc chờ phản hồi"
              tone="violet"
            />
            <WorkspaceStatCard
              icon={Gauge}
              label="Ticket khẩn cấp"
              value={data.summary.urgentTickets}
              description="Cần được ưu tiên SLA P1"
              tone="amber"
            />
          </div>

          {/* Khu vực biểu đồ: lưu lượng 7 ngày (trái) và tỷ trọng danh mục sự cố (phải) */}
          <div className="mt-6 grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(20rem,.6fr)]">
            <ChartCard weekly={weekly} />
            <CategoryCard categories={categories} />
          </div>

          {/* Real CMDB Asset Inventory & Technician Performance Grid */}
          {/* Lưới 2 bảng chi tiết: Phân bổ tài sản thiết bị CMDB và Hiệu suất xử lý kỹ thuật viên */}
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            {/* Bảng thống kê phân bổ thiết bị CNTT từ CMDB */}
            <section className="overflow-hidden rounded-xl border border-brand-bone bg-white p-5 shadow-xs">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="font-display text-sm font-bold text-brand-ink">
                    Phân Bổ Tài Sản Thiết Bị (CMDB)
                  </h2>
                  <p className="text-xs text-brand-slate">
                    Thống kê trực tiếp từ danh mục thiết bị trong PostgreSQL
                  </p>
                </div>
                <span className="rounded bg-purple-50 px-2 py-0.5 text-[10px] font-bold text-brand-violet uppercase">
                  CMDB Thực Tế
                </span>
              </div>
              <div className="overflow-x-auto">
                {assetBreakdown.length > 0 ? (
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-brand-bone text-[10px] font-bold text-brand-ash uppercase">
                        <th className="pb-2">Loại Thiết Bị</th>
                        <th className="pb-2 text-center">Tổng</th>
                        <th className="pb-2 text-center">Đang Dùng</th>
                        <th className="pb-2 text-right">Sẵn Sàng / Bảo Trì</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-brand-bone">
                      {assetBreakdown.map((item) => (
                        <tr key={item.key}>
                          <td className="py-3 font-semibold text-brand-ink">
                            {item.label}
                          </td>
                          <td className="py-3 text-center font-mono font-bold text-brand-ink">
                            {item.total}
                          </td>
                          <td className="py-3 text-center font-mono font-semibold text-brand-violet">
                            {item.assigned}
                          </td>
                          <td className="py-3 text-right">
                            <span className="rounded bg-emerald-50 px-2 py-0.5 font-semibold text-brand-emerald">
                              {item.available} kho / {item.maintenance} bảo trì
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="py-8 text-center text-xs text-brand-slate">
                    Chưa có thiết bị nào được ghi nhận trong CMDB.
                  </p>
                )}
              </div>
            </section>

            {/* Bảng thống kê số ticket đang xử lý và đã hoàn thành theo từng kỹ thuật viên */}
            <section className="overflow-hidden rounded-xl border border-brand-bone bg-white shadow-xs">
              <div className="border-b border-brand-bone px-5 py-4">
                <h2 className="font-display text-sm font-bold text-brand-ink">
                  Hiệu Suất Xử Lý Của Kỹ Thuật Viên
                </h2>
                <p className="mt-0.5 text-xs text-brand-slate">
                  Tổng hợp từ ticket đã phân công trong hệ thống
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-brand-bone bg-brand-mist/70 text-[10px] font-bold tracking-wider text-brand-slate uppercase">
                    <tr>
                      <th className="px-5 py-3">Kỹ thuật viên</th>
                      <th className="px-4 py-3 text-center">Đang xử lý</th>
                      <th className="px-4 py-3 text-center">Đã hoàn thành</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-brand-bone">
                    {technicians.map((item) => (
                      <tr
                        key={item.technicianId}
                        className="hover:bg-brand-mist/40"
                      >
                        <td className="px-5 py-3.5 font-semibold text-brand-ink">
                          {item.name}
                        </td>
                        <td className="px-4 py-3.5 text-center font-mono font-bold text-brand-violet">
                          {item.inProgress}
                        </td>
                        <td className="px-4 py-3.5 text-center font-mono font-bold text-brand-emerald">
                          {item.completed}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </>
      ) : null}
    </section>
  );
}

/**
 * Component con hiển thị biểu đồ cột đôi đối chiếu ticket phát sinh mới và đã giải quyết trong 7 ngày.
 */
function ChartCard({ weekly }) {
  return (
    <section className="min-w-0 rounded-xl border border-brand-bone bg-white p-5 shadow-xs">
      <h2 className="font-display text-sm font-bold text-brand-ink">
        Lưu Lượng Ticket Phát Sinh vs. Đã Xử Lý (7 Ngày)
      </h2>
      <p className="mt-0.5 text-xs text-brand-slate">
        Đối chiếu tốc độ tiếp nhận và năng lực giải quyết của đội ngũ IT
      </p>
      <div className="mt-5 h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={weekly}>
            <CartesianGrid
              stroke="#e8e8e8"
              strokeDasharray="3 3"
              vertical={false}
            />
            <XAxis
              dataKey="day"
              tick={{ fill: "#646464", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: "#646464", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip />
            <Bar
              dataKey="created"
              name="Phát sinh mới"
              fill="#6647f0"
              radius={[4, 4, 0, 0]}
            />
            <Bar
              dataKey="resolved"
              name="Đã giải quyết"
              fill="#00c07a"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

/**
 * Component con hiển thị biểu đồ tròn Donut và chú giải cơ cấu danh mục sự cố.
 */
function CategoryCard({ categories }) {
  return (
    <section className="min-w-0 rounded-xl border border-brand-bone bg-white p-5 shadow-xs">
      <h2 className="font-display text-sm font-bold text-brand-ink">
        Cơ Cấu Danh Mục Sự Cố
      </h2>
      <p className="mt-0.5 text-xs text-brand-slate">
        Tỷ trọng yêu cầu theo nhóm dịch vụ CNTT
      </p>
      <div className="mt-4 h-56">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={categories}
              dataKey="value"
              nameKey="name"
              innerRadius={55}
              outerRadius={85}
            >
              {categories.map((item, index) => (
                <Cell
                  key={item.name}
                  fill={COLORS[index % COLORS.length]}
                />
              ))}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      </div>
      {/* Chú giải màu và số lượng cụ thể cho từng danh mục */}
      <ul className="grid grid-cols-2 gap-2">
        {categories.map((item, index) => (
          <li
            key={item.name}
            className="flex items-center gap-1.5 text-xs text-brand-slate"
          >
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: COLORS[index % COLORS.length] }}
            />
            <span className="truncate">{item.name}:</span>
            <strong className="font-mono text-brand-ink">{item.value}</strong>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default AdminReportsPage;
