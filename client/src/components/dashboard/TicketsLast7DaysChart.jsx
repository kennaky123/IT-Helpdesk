/**
 * Biểu đồ cột đứng (Recharts BarChart) biểu diễn xu hướng số lượng ticket mới phát sinh trong 7 ngày gần nhất.
 *
 * Props:
 * - data: Mảng thống kê theo ngày (mỗi phần tử gồm { date, name, value }).
 *
 * Vai trò trong Dashboard (Recharts):
 * - Chiếm hàng biểu đồ xu hướng chính trên Dashboard, dùng ResponsiveContainer để tự co giãn theo độ rộng card.
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
 * Tooltip tùy biến của Recharts hiển thị nhãn ngày và số ticket phát sinh trong ngày đó.
 */
function TrendTooltip({ active, payload, label }) {
  if (!active || !payload?.[0]) {
    return null;
  }

  return (
    <div className="rounded-lg border border-brand-bone bg-brand-ink px-3 py-2 text-xs text-white shadow-lg">
      <p className="font-semibold">Ngày {label}</p>
      <p className="mt-1 font-mono text-brand-mint">
        {formatDashboardNumber(payload[0].value)} ticket phát sinh
      </p>
    </div>
  );
}

/**
 * Render biểu đồ cột xu hướng 7 ngày qua; chuyển sang ChartEmptyState nếu cả 7 ngày đều có giá trị 0.
 */
function TicketsLast7DaysChart({ data }) {
  // Kiểm tra xem có ít nhất một ngày phát sinh ticket hay không trước khi vẽ biểu đồ.
  const hasTickets = data.some((item) => item.value > 0);

  if (!hasTickets) {
    return (
      <ChartEmptyState message="Không có ticket mới trong 7 ngày gần nhất." />
    );
  }

  return (
    <div className="min-w-0">
      <div
        className="h-72 w-full min-w-0"
        role="img"
        aria-label="Biểu đồ số ticket được tạo trong 7 ngày gần nhất"
      >
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <BarChart
            data={data}
            margin={{ top: 8, right: 4, bottom: 0, left: -12 }}
            accessibilityLayer
          >
            <CartesianGrid
              stroke="#e8e8e8"
              strokeDasharray="3 3"
              vertical={false}
            />
            <XAxis
              dataKey="name"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#646464", fontSize: 11 }}
              interval={0}
              dy={8}
            />
            <YAxis
              allowDecimals={false}
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#646464", fontSize: 11 }}
              width={36}
            />
            <Tooltip
              content={<TrendTooltip />}
              cursor={{ fill: "#f8f9fa" }}
            />
            <Bar
              dataKey="value"
              name="Ticket mới"
              fill="#6647f0"
              radius={[6, 6, 0, 0]}
              maxBarSize={46}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      {/* Danh sách ẩn phục vụ trình đọc màn hình (screen reader) đọc lại số liệu từng ngày */}
      <ul className="sr-only">
        {data.map((item) => (
          <li key={item.date}>
            Ngày {item.name}: {item.value} ticket mới
          </li>
        ))}
      </ul>
    </div>
  );
}

export default TicketsLast7DaysChart;
