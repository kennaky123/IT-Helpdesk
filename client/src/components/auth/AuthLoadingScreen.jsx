/**
 * Component hiển thị màn hình chờ trong giai đoạn kiểm tra và khôi phục phiên đăng nhập.
 *
 * Props: Không nhận props.
 *
 * Vai trò trong UI Layout / Auth:
 * - Được render tạm thời bởi lớp bảo vệ route/AuthProvider khi ứng dụng đang xác thực
 *   token lưu trữ, giúp tránh nhấp nháy giao diện hoặc điều hướng nhầm về trang đăng nhập.
 */
import { LoaderCircle } from "lucide-react";

/**
 * Hiển thị vòng xoay tải ở chính giữa màn hình kèm thông báo trạng thái cho trình đọc màn hình.
 */
function AuthLoadingScreen() {
  return (
    <main
      className="flex min-h-svh items-center justify-center bg-slate-50 px-4"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-3 text-sm font-medium text-slate-600">
        <LoaderCircle
          className="size-5 animate-spin text-blue-600 motion-reduce:animate-none"
          aria-hidden="true"
        />
        Đang kiểm tra phiên đăng nhập...
      </div>
    </main>
  );
}

export default AuthLoadingScreen;
