/**
 * @file HomePage.jsx
 * @description Trang khởi động (Landing/Placeholder Page) giới thiệu trạng thái sẵn sàng của hệ thống IT Helpdesk và các công nghệ nền tảng.
 * @role Công khai / Mặc định (Auth chưa điều hướng hoặc trang tham chiếu khởi tạo dự án).
 * @flow Hiển thị thông điệp chào mừng và render danh sách công nghệ tĩnh (React + Vite, Tailwind CSS, Express + MongoDB).
 */
import { CircleCheck, Headset } from "lucide-react";

// Danh sách công nghệ nền tảng được hiển thị trên thẻ trạng thái dự án
const technologies = [
  "React + Vite",
  "Tailwind CSS",
  "Express + MongoDB",
];

/**
 * Component trang chủ khởi động dự án.
 * Không gọi API hay xử lý form; chỉ hiển thị giao diện giới thiệu và kiểm tra bộ công cụ UI.
 */
function HomePage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <section className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
        <div className="mb-6 flex size-14 items-center justify-center rounded-2xl bg-blue-600 text-white">
          <Headset aria-hidden="true" size={28} />
        </div>

        <p className="text-sm font-semibold uppercase tracking-wider text-blue-600">
          IT Helpdesk System
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          Cấu trúc dự án đã sẵn sàng
        </h1>
        <p className="mt-4 leading-7 text-slate-600">
          Đây là trang khởi động tối thiểu. Authentication, quản lý ticket và
          dashboard sẽ được triển khai theo từng module tiếp theo.
        </p>

        <ul className="mt-8 grid gap-3 sm:grid-cols-3">
          {technologies.map((technology) => (
            <li
              className="flex items-center gap-2 rounded-xl bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700"
              key={technology}
            >
              <CircleCheck
                aria-hidden="true"
                className="shrink-0 text-emerald-600"
                size={18}
              />
              {technology}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

export default HomePage;
