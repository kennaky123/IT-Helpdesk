/**
 * @file LoginPage.jsx
 * @description Trang đăng nhập trung tâm của hệ thống DeskPro IT (AIOps v3.0), hỗ trợ xác thực tài khoản doanh nghiệp và điều hướng theo phân quyền vai trò (RBAC).
 * @role Auth (người dùng chưa đăng nhập; tự động chuyển hướng nếu đã có phiên hợp lệ).
 * @flow
 * 1. Kiểm tra trạng thái xác thực từ `useAuth()`: hiển thị màn hình chờ nếu `isLoading`, hoặc điều hướng ngay sang trang mặc định theo `user.role` nếu `isAuthenticated`.
 * 2. Validate form đăng nhập (`email`, `password`, `rememberMe`) bằng Zod + `react-hook-form`.
 * 3. Khi submit hợp lệ (`onValidSubmit`): gọi `login()`, tính toán `redirectPath` phù hợp với vai trò qua `getRedirectPath()` và điều hướng `navigate(redirectPath, { replace: true })`.
 * 4. Khi lỗi API: hiển thị thông báo lỗi và focus vào khung alert để hỗ trợ truy cập.
 */
import { zodResolver } from "@hookform/resolvers/zod";
import {
  CheckCircle2,
  Eye,
  EyeOff,
  LoaderCircle,
  LockKeyhole,
  Mail,
  ShieldCheck,
} from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import {
  Link,
  Navigate,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { z } from "zod";
import AuthLoadingScreen from "../../components/auth/AuthLoadingScreen.jsx";
import { getDefaultPathForRole } from "../../constants/roles.js";
import useAuth from "../../hooks/useAuth.js";
import { getLoginError } from "../../services/authService.js";

// Schema Zod kiểm tra hợp lệ dữ liệu đầu vào của form đăng nhập phía client
const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Email là bắt buộc.")
    .max(254, "Email không đúng định dạng.")
    .email("Email không đúng định dạng."),
  password: z.string().min(1, "Mật khẩu là bắt buộc."),
  rememberMe: z.boolean().default(false),
});

// Tiền tố đường dẫn được phép truy cập tương ứng cho từng vai trò sau khi đăng nhập
const ROLE_PATH_PREFIXES = {
  user: "/user/",
  technician: "/technician/",
  admin: "/admin/",
};

/**
 * Xác định đường dẫn chuyển hướng sau khi đăng nhập thành công dựa trên vai trò và vị trí trước đó.
 * Chỉ quay lại trang `previousLocation` nếu đường dẫn đó là `/profile` hoặc khớp prefix vai trò; ngược lại về trang mặc định của vai trò.
 */
function getRedirectPath(role, previousLocation) {
  const defaultPath = getDefaultPathForRole(role);
  const pathname = previousLocation?.pathname;
  const allowedPrefix = ROLE_PATH_PREFIXES[role];

  if (
    !pathname ||
    (pathname !== "/profile" &&
      !pathname.startsWith(allowedPrefix))
  ) {
    return defaultPath;
  }

  return `${pathname}${previousLocation.search ?? ""}${
    previousLocation.hash ?? ""
  }`;
}

/**
 * Component trang Đăng nhập.
 * Quản lý trạng thái form, ẩn/hiện mật khẩu, xử lý lỗi API và luồng điều hướng tự động theo role.
 */
function LoginPage() {
  // Lưu thông báo lỗi trả về từ API đăng nhập (null khi không có lỗi)
  const [apiError, setApiError] = useState(null);
  // Bật/tắt chế độ hiển thị ký tự mật khẩu ở ô input password
  const [showPassword, setShowPassword] = useState(false);
  // Lấy trạng thái phiên đăng nhập và hàm login() từ AuthContext
  const { isAuthenticated, isLoading, login, user } = useAuth();
  // Lấy location hiện tại (để đọc location.state?.from) và hàm điều hướng navigate
  const location = useLocation();
  const navigate = useNavigate();
  // Ref trỏ tới hộp thông báo lỗi API để tự động focus khi đăng nhập thất bại
  const apiErrorRef = useRef(null);

  // Khởi tạo react-hook-form kết hợp zodResolver để validate form đăng nhập
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
      rememberMe: false,
    },
  });

  // Cập nhật tiêu đề tab trình duyệt khi mở trang Đăng nhập
  useEffect(() => {
    document.title = "Đăng nhập | DeskPro IT — AIOps v3.0";
  }, []);

  // Trong lúc đang khôi phục phiên đăng nhập ban đầu, hiển thị màn hình chờ xác thực
  if (isLoading) {
    return <AuthLoadingScreen />;
  }

  // Nếu người dùng đã đăng nhập sẵn, chuyển hướng thẳng về trang tổng quan theo role
  if (isAuthenticated) {
    return <Navigate to={getDefaultPathForRole(user.role)} replace />;
  }

  /**
   * Event handler xử lý khi form đăng nhập đã vượt qua validation của Zod.
   * Chuẩn hóa email, gọi API login, xác định trang đích theo role và xử lý lỗi API nếu thất bại.
   */
  async function onValidSubmit(values) {
    setApiError(null);

    try {
      const authenticatedUser = await login({
        email: values.email.trim().toLowerCase(),
        password: values.password,
        rememberMe: values.rememberMe,
      });
      // Kiểm tra lại quyền truy cập của đường dẫn trước đó để tránh redirect sai role
      const redirectPath = getRedirectPath(
        authenticatedUser.role,
        location.state?.from,
      );

      navigate(redirectPath, { replace: true });
    } catch (error) {
      setApiError(getLoginError(error));
      window.requestAnimationFrame(() => apiErrorRef.current?.focus());
    }
  }

  // Class CSS động cho ô nhập email (đổi viền đỏ khi có lỗi validate)
  const emailInputClasses = [
    "h-11 w-full rounded-xl border bg-brand-mist pr-4 pl-10 text-sm text-brand-ink outline-none transition placeholder:text-brand-ash focus:bg-white disabled:cursor-not-allowed disabled:opacity-60",
    errors.email
      ? "border-red-400 focus:border-red-500 focus:ring-2 focus:ring-red-100"
      : "border-brand-bone focus:border-brand-violet focus:ring-2 focus:ring-brand-violet/20",
  ].join(" ");
  // Class CSS động cho ô nhập mật khẩu (đổi viền đỏ khi có lỗi validate)
  const passwordInputClasses = [
    "h-11 w-full rounded-xl border bg-brand-mist pr-11 pl-10 text-sm text-brand-ink outline-none transition placeholder:text-brand-ash focus:bg-white disabled:cursor-not-allowed disabled:opacity-60",
    errors.password
      ? "border-red-400 focus:border-red-500 focus:ring-2 focus:ring-red-100"
      : "border-brand-bone focus:border-brand-violet focus:ring-2 focus:ring-brand-violet/20",
  ].join(" ");

  return (
    <main className="grid min-h-svh bg-brand-mist lg:grid-cols-[minmax(0,1.08fr)_minmax(28rem,0.92fr)]">
      {/* Left Brand Showcase (DeskPro IT AIOps v3.0) */}
      {/* Cột trái: Khu vực giới thiệu thương hiệu và tính năng nổi bật của DeskPro IT (ẩn trên màn hình nhỏ) */}
      <section className="relative hidden overflow-hidden bg-brand-onyx p-12 text-white lg:flex lg:flex-col lg:justify-between xl:p-16">
        <div
          className="pointer-events-none absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              "radial-gradient(#6647f0 1.5px, transparent 1.5px)",
            backgroundSize: "24px 24px",
          }}
          aria-hidden="true"
        />
        <div
          className="absolute -top-40 -left-32 size-96 rounded-full bg-brand-violet/25 blur-3xl"
          aria-hidden="true"
        />
        <div
          className="absolute right-0 bottom-0 size-80 translate-x-1/3 translate-y-1/3 rounded-full bg-brand-blue/15 blur-3xl"
          aria-hidden="true"
        />

        <div className="relative flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-violet font-display text-sm font-extrabold text-white shadow-lg">
            IT
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-display text-lg font-extrabold tracking-tight">
                DeskPro
              </span>
              <span className="rounded-md border border-brand-mint/30 bg-brand-mint/15 px-1.5 py-0.5 font-mono text-[10px] font-bold text-brand-mint">
                AIOps v3.0
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Enterprise ITSM, Asset &amp; Ticket Platform
            </p>
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, x: -16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="relative max-w-xl py-12"
        >
          <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-violet/40 bg-brand-violet/20 px-3 py-1 text-xs font-semibold text-brand-mint">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-mint" />
            Hệ thống quản lý sự cố &amp; hạ tầng CNTT chuẩn ITIL v4
          </span>
          <h2 className="mt-4 font-display text-4xl leading-tight font-extrabold tracking-tight xl:text-5xl">
            Điều phối sự cố, quản lý tài sản &amp; phân tích BI hợp nhất.
          </h2>
          <p className="mt-4 max-w-lg text-sm leading-6 text-slate-300">
            Kết nối Cổng tự phục vụ nhân viên, Bàn làm việc 3 cột của kỹ thuật
            viên, Quản lý tài sản CMDB và Hệ thống phân tích dữ liệu PostgreSQL trên một nền
            tảng duy nhất.
          </p>

          <ul className="mt-8 space-y-3.5 text-xs font-medium text-slate-200">
            {[
              "Hàng đợi Ticket mật độ cao với cảnh báo SLA P1–P4 thời gian thực",
              "Bàn làm việc 3 cột tích hợp CMDB thiết bị & Canned Responses",
              "Quản lý kho thiết bị, bản quyền phần mềm & bảo mật USB DLP",
            ].map((item) => (
              <li key={item} className="flex items-center gap-2.5">
                <CheckCircle2
                  className="size-4 shrink-0 text-brand-mint"
                  aria-hidden="true"
                />
                {item}
              </li>
            ))}
          </ul>
        </motion.div>

        <div className="relative flex items-center justify-between border-t border-white/10 pt-6 font-mono text-xs text-slate-400">
          <span>DeskPro IT Service Management</span>
          <span className="text-brand-mint">SLA Uptime: 99.98%</span>
        </div>
      </section>

      {/* Right Login Card */}
      {/* Cột phải: Thẻ chứa form đăng nhập tài khoản doanh nghiệp */}
      <section className="flex min-w-0 items-center justify-center px-4 py-8 sm:px-8 lg:px-10 xl:px-16">
        <div className="w-full max-w-md">
          <div className="mb-6 flex items-center gap-2.5 lg:hidden">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-ink font-display text-sm font-extrabold text-white">
              IT
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-display text-base font-extrabold text-brand-ink">
                  DeskPro
                </span>
                <span className="rounded bg-brand-violet/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-brand-violet">
                  AIOps v3.0
                </span>
              </div>
              <p className="text-xs text-brand-slate">
                Enterprise ITSM Platform
              </p>
            </div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.28, ease: "easeOut" }}
            className="rounded-2xl border border-brand-bone bg-white p-6 shadow-xs sm:p-8"
          >
            <div>
              <span className="inline-flex items-center rounded-md bg-brand-violet/10 px-2 py-0.5 text-[11px] font-bold text-brand-violet uppercase">
                Xác thực SSO / Nội bộ
              </span>
              <h1 className="mt-2 font-display text-2xl font-extrabold tracking-tight text-brand-ink sm:text-3xl">
                Đăng nhập DeskPro IT
              </h1>
              <p className="mt-1.5 text-xs leading-5 text-brand-slate">
                Sử dụng tài khoản doanh nghiệp để truy cập không gian làm việc
                theo phân quyền.
              </p>
            </div>

            {/* Form đăng nhập sử dụng react-hook-form và hiển thị vùng lỗi API (role="alert") nếu xác thực thất bại */}
            <form
              className="mt-6 space-y-4"
              onSubmit={(event) => handleSubmit(onValidSubmit)(event)}
              noValidate
              aria-busy={isSubmitting}
            >
              {apiError ? (
                <div
                  ref={apiErrorRef}
                  className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800 outline-none"
                  role="alert"
                  tabIndex={-1}
                >
                  <p className="font-bold">{apiError.message}</p>
                  {apiError.details.length > 0 ? (
                    <ul className="mt-1.5 list-disc space-y-1 pl-4">
                      {apiError.details.map((detail) => (
                        <li key={detail}>{detail}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}

              <div>
                <label
                  htmlFor="email"
                  className="mb-1.5 block text-xs font-bold text-brand-ink"
                >
                  Email doanh nghiệp
                </label>
                <div className="relative">
                  <Mail
                    className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-brand-ash"
                    aria-hidden="true"
                  />
                  <input
                    id="email"
                    type="email"
                    className={emailInputClasses}
                    placeholder="tenban@congty.com"
                    autoComplete="username"
                    inputMode="email"
                    autoCapitalize="none"
                    spellCheck={false}
                    maxLength={254}
                    disabled={isSubmitting}
                    aria-invalid={Boolean(errors.email)}
                    aria-describedby={errors.email ? "email-error" : undefined}
                    {...register("email", {
                      onChange: () => setApiError(null),
                    })}
                  />
                </div>
                {errors.email ? (
                  <p id="email-error" className="mt-1 text-xs text-red-600">
                    {errors.email.message}
                  </p>
                ) : null}
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="mb-1.5 block text-xs font-bold text-brand-ink"
                >
                  Mật khẩu
                </label>
                <div className="relative">
                  <LockKeyhole
                    className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-brand-ash"
                    aria-hidden="true"
                  />
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    className={passwordInputClasses}
                    placeholder="Nhập mật khẩu"
                    autoComplete="current-password"
                    disabled={isSubmitting}
                    aria-invalid={Boolean(errors.password)}
                    aria-describedby={
                      errors.password ? "password-error" : undefined
                    }
                    {...register("password", {
                      onChange: () => setApiError(null),
                    })}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setShowPassword((currentValue) => !currentValue)
                    }
                    className="absolute top-1/2 right-1.5 flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-brand-ash transition hover:bg-brand-bone/60 hover:text-brand-ink"
                    disabled={isSubmitting}
                    aria-label={
                      showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"
                    }
                    aria-pressed={showPassword}
                  >
                    {showPassword ? (
                      <EyeOff className="size-4" aria-hidden="true" />
                    ) : (
                      <Eye className="size-4" aria-hidden="true" />
                    )}
                  </button>
                </div>
                {errors.password ? (
                  <p id="password-error" className="mt-1 text-xs text-red-600">
                    {errors.password.message}
                  </p>
                ) : null}
              </div>

              {/* Tùy chọn duy trì phiên đăng nhập (rememberMe) và liên kết chuyển tới trang Quên mật khẩu */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-brand-slate">
                  <input
                    type="checkbox"
                    className="size-3.5 rounded border-brand-ash accent-brand-violet"
                    disabled={isSubmitting}
                    {...register("rememberMe")}
                  />
                  Duy trì đăng nhập
                </label>
                <Link
                  to="/forgot-password"
                  className="text-xs font-semibold text-brand-violet hover:underline"
                >
                  Quên mật khẩu?
                </Link>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-brand-ink px-4 text-xs font-bold text-white shadow-xs transition hover:bg-brand-carbon disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <LoaderCircle
                      className="size-4 animate-spin"
                      aria-hidden="true"
                    />
                    Đang xác thực...
                  </>
                ) : (
                  "Đăng Nhập Hệ Thống →"
                )}
              </button>

              <p className="flex items-start gap-2 pt-2 text-[11px] leading-5 text-brand-ash">
                <ShieldCheck
                  className="mt-0.5 size-4 shrink-0 text-brand-emerald"
                  aria-hidden="true"
                />
                Phiên làm việc được bảo vệ bằng JWT &amp; kiểm soát truy cập
                RBAC theo vai trò.
              </p>
            </form>
          </motion.div>
        </div>
      </section>
    </main>
  );
}

export default LoginPage;
