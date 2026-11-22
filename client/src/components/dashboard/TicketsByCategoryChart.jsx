/**
 * Biểu đồ cột ngang (Recharts BarChart) thống kê số lượng ticket theo từng danh mục sự cố/yêu cầu.
 *
 * Props:
 * - data: Mảng phần tử thống kê theo danh mục (mỗi phần tử gồm { key, name, value }).
 *
 * Vai trò trong Dashboard (Recharts):
 * - Sử dụng bố cục `layout="vertical"` để hiển thị rõ tên danh mục trên trục Y và thanh số lượng theo trục X.
 * - Tự động tính chiều cao theo số lượng danh mục có dữ liệu và hỗ trợ cuộn dọc khi danh sách dài.
 */
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatDashboardNumber } from "../../utils/dashboardFormatters.js";
import ChartEmptyState from "./ChartEmptyState.jsx";

/**
 * Rút gọn nhãn tên danh mục trên trục Y nếu vượt quá 16 ký tự để tránh chiếm quá nhiều diện tích biểu đồ.
 */
function truncateCategoryName(value) {
  return value.length > 16 ? `${value.slice(0, 15)}…` : value;
}

/**
 * Tooltip tùy biến của Recharts hiển thị tên đầy đủ của danh mục và số lượng ticket khi rê chuột vào thanh cột.
 */
function CategoryTooltip({ active, payload }) {
  if (!active || !payload?.[0]?.payload) {
    return null;
  }

  // Lấy bản ghi dữ liệu gốc của cột đang được hover từ payload của Recharts.
  const item = payload[0].payload;

  return (
    <div className="max-w-56 rounded-lg border border-brand-bone bg-brand-ink px-3 py-2 text-xs text-white shadow-lg">
      <p className="font-semibold">{item.name}</p>
      <p className="mt-1 font-mono text-brand-mint">
        {formatDashboardNumber(item.value)} ticket
      </p>
    </div>
  );
}

/**
 * Render biểu đồ cột ngang Recharts theo danh mục; hiển thị ChartEmptyState nếu không có danh mục nào phát sinh ticket.
 */
function TicketsByCategoryChart({ data }) {
  // Chỉ giữ lại các danh mục có ít nhất 1 ticket để biểu đồ gọn gàng và tập trung vào nhóm phát sinh thực tế.
  const chartData = data.filter((item) => item.value > 0);

  if (chartData.length === 0) {
    return (
      <ChartEmptyState message="Chưa có ticket thuộc danh mục nào trong hệ thống." />
    );
  }

  // Tính chiều cao động (tối thiểu 260px, mỗi danh mục 44px) để các thanh bar không bị nén khi có nhiều danh mục.
  const chartHeight = Math.max(260, chartData.length * 44);

  return (
    <div className="min-w-0">
      <div
        className="custom-scrollbar max-h-[28rem] min-w-0 overflow-x-hidden overflow-y-auto pr-1"
        role="img"
        aria-label="Biểu đồ số ticket theo từng danh mục"
      >
        <div className="w-full min-w-0" style={{ height: chartHeight }}>
          {/* BarChart layout="vertical": trục X hiển thị số lượng ticket, trục Y hiển thị tên danh mục; tắt animation để cập nhật SSE mượt */}
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 2, right: 12, bottom: 2, left: 0 }}
              accessibilityLayer
            >
              <CartesianGrid
                stroke="#e8e8e8"
                strokeDasharray="3 3"
                horizontal={false}
              />
              <XAxis
                type="number"
                allowDecimals={false}
                axisLine={false}
                tickLine={false}
                tick={{ fill: "#646464", fontSize: 11 }}
              />
              <YAxis
                type="category"
                dataKey="name"
                axisLine={false}
                tickLine={false}
                tick={{ fill: "#202020", fontSize: 11, fontWeight: 600 }}
                tickFormatter={truncateCategoryName}
                width={108}
              />
              <Tooltip
                content={<CategoryTooltip />}
                cursor={{ fill: "#f8f9fa" }}
              />
              <Bar
                dataKey="value"
                name="Ticket"
                fill="#0091ff"
                radius={[0, 6, 6, 0]}
                barSize={18}
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <ul className="sr-only">
        {chartData.map((item) => (
          <li key={item.key}>
            {item.name}: {item.value} ticket
          </li>
        ))}
      </ul>
    </div>
  );
}

export default TicketsByCategoryChart;
