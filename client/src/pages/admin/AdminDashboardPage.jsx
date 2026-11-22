import {
  CheckCircle2,
  Clock3,
  Download,
  Gauge,
  RefreshCw,
  Star,
  Ticket,
  TriangleAlert,
  Wrench,
} from "lucide-react";
import { toast } from "react-toastify";
import DashboardChartCard from "../../components/dashboard/DashboardChartCard.jsx";
import DashboardErrorState from "../../components/dashboard/DashboardErrorState.jsx";
import DashboardSkeleton from "../../components/dashboard/DashboardSkeleton.jsx";
import DashboardStatCard from "../../components/dashboard/DashboardStatCard.jsx";
import LatestTicketsTable from "../../components/dashboard/LatestTicketsTable.jsx";
import TechnicianPerformanceList from "../../components/dashboard/TechnicianPerformanceList.jsx";
import TicketsByCategoryChart from "../../components/dashboard/TicketsByCategoryChart.jsx";
import TicketsByStatusChart from "../../components/dashboard/TicketsByStatusChart.jsx";
import TicketsLast7DaysChart from "../../components/dashboard/TicketsLast7DaysChart.jsx";
import { Button } from "../../components/ui/button.jsx";
import useAdminDashboard from "../../hooks/useAdminDashboard.js";
import { getDashboardErrorMessage } from "../../services/dashboardService.js";
import {
  formatDashboardGeneratedAt,
  formatDashboardNumber,
} from "../../utils/dashboardFormatters.js";

function formatAverageResolution(resolutionTime) {
  if (!resolutionTime || resolutionTime.minutes == null) {
    return "Chưa có dữ liệu";
  }
  if (resolutionTime.minutes < 60) {
    return `${Math.round(resolutionTime.minutes)} phút`;
  }
  return `${resolutionTime.hours} giờ`;
}

function AdminDashboardPage() {
  const { data, error, isLoading, isRefreshing, refetch } =
    useAdminDashboard();

  function handleExportCsv() {
    if (!data) return;
    const rows = [
      "Chỉ số,Giá trị",
      `Tổng số ticket,${data.summary.totalTickets}`,
      `Ticket đang chờ,${data.summary.pendingTickets}`,
      `Ticket đang xử lý,${data.summary.processingTickets}`,
      `Ticket đã hoàn thành,${data.summary.completedTickets}`,
      `Ticket khẩn cấp P1,${data.summary.urgentTickets ?? 0}`,
      `Đánh giá CSAT trung bình,${data.summary.averageRating ?? "Chưa có"}`,
    ];
    const url = URL.createObjectURL(
      new Blob([`\uFEFF${rows.join("\n")}`], {
        type: "text/csv;charset=utf-8",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "deskpro-analytics.csv";
    link.click();
    URL.revokeObjectURL(url);
    toast.success("Đã xuất báo cáo thống kê CSV!");
  }

  return (
    <section
      aria-labelledby="admin-dashboard-title"
      aria-busy={isRefreshing}
      className="mx-auto max-w-[1600px] space-y-6 px-4 py-6 sm:px-6"
    >
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1
              id="admin-dashboard-title"
              className="font-display text-2xl font-extrabold tracking-tight text-brand-ink"
            >
              Tổng Quan Vận Hành IT Help Desk
            </h1>
            <span className="rounded-md border border-brand-violet/20 bg-brand-violet/10 px-2 py-0.5 font-mono text-[10px] font-bold text-brand-violet">
              POSTGRESQL LIVE
            </span>
            <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-mono text-[10px] font-bold text-brand-emerald">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-emerald" />
              Cập nhật:{" "}
              {data
                ? formatDashboardGeneratedAt(data.generatedAt, data.timeZone)
                : "Đang tải"}
            </span>
          </div>
          <p className="mt-1 text-xs text-brand-slate">
            Tổng hợp số liệu ticket, thời gian xử lý và đánh giá hài lòng trực tiếp từ cơ sở dữ liệu PostgreSQL.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleExportCsv}
            disabled={!data}
          >
            <Download className="size-3.5 text-brand-ink" />
            Xuất Báo Cáo CSV
          </Button>
          {data ? (
            <Button
              type="button"
              size="sm"
              onClick={refetch}
              disabled={isRefreshing}
            >
              <RefreshCw
                className={`size-3.5 ${isRefreshing ? "animate-spin" : ""}`}
                aria-hidden="true"
              />
              {isRefreshing ? "Đang đồng bộ..." : "Làm mới"}
            </Button>
          ) : null}
        </div>
      </div>

      {isLoading ? <DashboardSkeleton /> : null}

      {!isLoading && error && !data ? (
        <DashboardErrorState
          message={getDashboardErrorMessage(error)}
          onRetry={refetch}
        />
      ) : null}

      {!isLoading && data ? (
        <div className="space-y-6">
          {error ? (
            <div
              className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900 sm:flex-row sm:items-center sm:justify-between"
              role="alert"
            >
              <p className="flex items-start gap-2">
                <TriangleAlert
                  className="mt-0.5 size-4 shrink-0"
                  aria-hidden="true"
                />
                {getDashboardErrorMessage(error)} Dữ liệu gần nhất vẫn đang được
                hiển thị.
              </p>
              <button
                type="button"
                onClick={refetch}
                className="shrink-0 rounded-lg px-3 py-1.5 font-semibold text-amber-900 hover:bg-amber-100"
              >
                Thử lại
              </button>
            </div>
          ) : null}

          {/* Live Database Ticket Counters */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <DashboardStatCard
              icon={Ticket}
              label="Tổng số ticket"
              value={formatDashboardNumber(data.summary.totalTickets)}
              description="Tất cả yêu cầu trong cơ sở dữ liệu"
              tone="blue"
            />
            <DashboardStatCard
              icon={Clock3}
              label="Ticket đang chờ"
              value={formatDashboardNumber(data.summary.pendingTickets)}
              description="Chưa được phân công xử lý"
              tone="amber"
            />
            <DashboardStatCard
              icon={Wrench}
              label="Ticket đang xử lý"
              value={formatDashboardNumber(data.summary.processingTickets)}
              description="Đã phân công, đang xử lý hoặc chờ user"
              tone="violet"
            />
            <DashboardStatCard
              icon={CheckCircle2}
              label="Ticket đã hoàn thành"
              value={formatDashboardNumber(data.summary.completedTickets)}
              description="Đã giải quyết hoặc đã đóng"
              tone="emerald"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <DashboardStatCard
              icon={Clock3}
              label="Thời gian xử lý TB (MTTR)"
              value={formatAverageResolution(data.summary.averageResolutionTime)}
              description={`Tính trên ${data.summary.averageResolutionTime?.sampleSize ?? 0} ticket đã hoàn thành`}
              tone="violet"
            />
            <DashboardStatCard
              icon={Star}
              label="Đánh giá hài lòng (CSAT)"
              value={
                data.summary.averageRating != null
                  ? `${data.summary.averageRating}/5`
                  : "Chưa có"
              }
              description={`${data.summary.ratingCount ?? 0} lượt đánh giá thực tế`}
              tone="emerald"
            />
            <DashboardStatCard
              icon={Gauge}
              label="Tỷ lệ hoàn thành"
              value={
                data.summary.totalTickets > 0
                  ? `${Math.round((data.summary.completedTickets / data.summary.totalTickets) * 100)}%`
                  : "0%"
              }
              description={`${formatDashboardNumber(data.summary.completedTickets)}/${formatDashboardNumber(data.summary.totalTickets)} ticket`}
              tone="blue"
            />
            <DashboardStatCard
              icon={TriangleAlert}
              label="Ticket khẩn cấp (P1)"
              value={formatDashboardNumber(data.summary.urgentTickets ?? 0)}
              description="Đang mở ở mức độ khẩn cấp"
              tone="amber"
            />
          </div>

          <div className="grid min-w-0 gap-6 xl:grid-cols-2">
            <DashboardChartCard
              titleId="ticket-trend-title"
              title="Lưu Lượng Ticket Phát Sinh Trong 7 Ngày Gần Nhất"
              description="Thống kê theo ngày tại múi giờ Việt Nam"
              className="xl:col-span-2"
            >
              <TicketsLast7DaysChart
                data={data.charts.ticketsCreatedLast7Days}
              />
            </DashboardChartCard>

            <DashboardChartCard
              titleId="ticket-status-title"
              title="Phân Bổ Ticket Theo Trạng Thái SLA"
              description="Tỷ trọng trạng thái hiện hành trên toàn bộ hàng đợi"
            >
              <TicketsByStatusChart data={data.charts.ticketsByStatus} />
            </DashboardChartCard>

            <DashboardChartCard
              titleId="ticket-category-title"
              title="Phân Bổ Sự Cố Theo Danh Mục Kỹ Thuật"
              description="Truy vấn nhóm theo danh mục dịch vụ CNTT"
            >
              <TicketsByCategoryChart data={data.charts.ticketsByCategory} />
            </DashboardChartCard>
          </div>

          <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(20rem,0.6fr)]">
            <LatestTicketsTable
              tickets={data.latestTickets}
              timeZone={data.timeZone}
            />
            <TechnicianPerformanceList
              technicians={data.charts.technicianPerformance}
            />
          </div>
        </div>
      ) : null}

      {isRefreshing ? (
        <span className="sr-only" role="status" aria-live="polite">
          Đang làm mới dữ liệu dashboard...
        </span>
      ) : null}
    </section>
  );
}

export default AdminDashboardPage;
