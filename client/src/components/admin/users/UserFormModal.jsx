/**
 * Modal biểu mẫu tạo mới hoặc chỉnh sửa tài khoản người dùng trong module quản trị User của Admin.
 * Hỗ trợ validate thông tin cá nhân, kiểm tra email trùng lặp, đổi mật khẩu tùy chọn khi sửa và phân quyền vai trò/trạng thái.
 *
 * Props:
 * - user: Đối tượng người dùng cần chỉnh sửa (null/undefined nếu đang thêm mới).
 * - users: Danh sách người dùng hiện có dùng để kiểm tra trùng lặp email.
 * - onClose: Callback đóng modal.
 * - onSave: Callback async nhận payload người dùng đã chuẩn hóa để gọi API lưu.
 */
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, LoaderCircle, UserPlus } from "lucide-react";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "../../ui/button.jsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../ui/dialog.jsx";
import { Input } from "../../ui/input.jsx";

// Giá trị mặc định khi mở modal tạo người dùng mới
const EMPTY_FORM = {
  fullName: "",
  email: "",
  phone: "",
  department: "",
  password: "",
  confirmPassword: "",
  role: "user",
  status: "active",
};

// Class CSS dùng chung cho các thẻ select chọn vai trò và trạng thái
const selectClasses =
  "mt-2 min-h-10 w-full rounded-lg border border-brand-bone bg-white px-3.5 text-sm text-brand-ink outline-none transition focus:border-brand-violet focus:ring-2 focus:ring-brand-violet/20";

/**
 * Tạo schema Zod validate form người dùng theo ngữ cảnh thêm mới hoặc chỉnh sửa (editingId).
 * - Kiểm tra email hợp lệ và không trùng với tài khoản khác.
 * - Kiểm tra số điện thoại (nếu có nhập), độ dài phòng ban.
 * - Khi thêm mới hoặc có nhập mật khẩu mới lúc chỉnh sửa: bắt buộc độ dài >= 8 và đủ chữ thường, chữ hoa, số; đồng thời kiểm tra khớp confirmPassword.
 */
function createUserFormSchema(users, editingId) {
  return z
    .object({
      fullName: z.string().trim().min(2, "Họ và tên phải có ít nhất 2 ký tự."),
      email: z
        .string()
        .trim()
        .email("Email không đúng định dạng.")
        .refine(
          // Không cho phép trùng email với user khác trong danh sách
          (value) =>
            !users.some(
              (item) =>
                item.id !== editingId &&
                item.email.toLowerCase() === value.toLowerCase(),
            ),
          "Email này đã được sử dụng.",
        ),
      phone: z
        .string()
        .trim()
        .refine(
          // Cho phép để trống, nhưng nếu có nhập thì phải đúng định dạng số điện thoại
          (value) => !value || /^[0-9+().\s-]{8,20}$/.test(value),
          "Số điện thoại không đúng định dạng.",
        ),
      department: z
        .string()
        .trim()
        .max(100, "Phòng ban không quá 100 ký tự."),
      role: z.enum(["user", "technician", "admin"]),
      status: z.enum(["active", "locked"]),
      password: z.string(),
      confirmPassword: z.string(),
    })
    .superRefine((data, ctx) => {
      // Nếu đang tạo mới (!editingId) hoặc người dùng có nhập mật khẩu mới khi sửa thì kiểm tra độ mạnh mật khẩu
      if (!editingId || data.password) {
        if (data.password.length < 8) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["password"],
            message: "Mật khẩu phải có ít nhất 8 ký tự.",
          });
        } else if (
          !/[a-z]/.test(data.password) ||
          !/[A-Z]/.test(data.password) ||
          !/\d/.test(data.password)
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["password"],
            message: "Mật khẩu cần gồm chữ thường, chữ hoa và chữ số.",
          });
        }
      }

      // Kiểm tra mật khẩu xác nhận phải trùng khớp với mật khẩu đã nhập
      if (data.password !== data.confirmPassword) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["confirmPassword"],
          message: "Mật khẩu xác nhận không khớp.",
        });
      }
    });
}

/**
 * Component phụ hiển thị thông báo lỗi validation dưới mỗi trường form.
 */
function FieldError({ children }) {
  return children ? (
    <p className="mt-1.5 text-xs text-red-600" role="alert">
      {children}
    </p>
  ) : null;
}

/**
 * Component modal tạo và chỉnh sửa thông tin người dùng.
 */
function UserFormModal({ user, users, onClose, onSave }) {
  // Xác định đang chỉnh sửa user hay tạo tài khoản mới
  const isEditing = Boolean(user);
  // State bật/tắt hiển thị ký tự mật khẩu
  const [showPassword, setShowPassword] = useState(false);

  // Tạo schema validate gắn với danh sách users và id đang sửa
  const schema = useMemo(
    () => createUserFormSchema(users, user?.id),
    [users, user?.id],
  );

  // Khởi tạo React Hook Form với zodResolver và giá trị mặc định tương ứng chế độ thêm/sửa
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: user
      ? {
          fullName: user.fullName ?? "",
          email: user.email ?? "",
          phone: user.phone ?? "",
          department: user.department ?? "",
          role: user.role ?? "user",
          status: user.status === "locked" ? "locked" : "active",
          password: "",
          confirmPassword: "",
        }
      : EMPTY_FORM,
  });

  // Handler xử lý submit sau khi dữ liệu vượt qua kiểm tra Zod
  async function onValidSubmit(values) {
    try {
      // Cắt khoảng trắng đầu/cuối các trường chuỗi trước khi truyền ra handler lưu của component cha
      await onSave({
        ...values,
        fullName: values.fullName.trim(),
        email: values.email.trim(),
        phone: values.phone.trim(),
        department: values.department.trim(),
      });
    } catch {
      // Parent handler reports API error via toast
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        // Ngăn đóng modal khi request đang trong quá trình gửi lên server
        if (!open && !isSubmitting) onClose();
      }}
    >
      <DialogContent className="max-w-2xl p-0">
        {/* Tiêu đề modal thay đổi theo chế độ thêm mới hoặc chỉnh sửa */}
        <DialogHeader className="flex-row items-center gap-3 space-y-0 pr-12">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
            <UserPlus className="size-5" />
          </span>
          <div>
            <DialogTitle>
              {isEditing ? "Chỉnh sửa người dùng" : "Thêm người dùng"}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {isEditing
                ? "Cập nhật thông tin tài khoản trong hệ thống."
                : "Tạo tài khoản mới trong hệ thống."}
            </DialogDescription>
          </div>
        </DialogHeader>

        {/* Form thông tin tài khoản người dùng */}
        <form onSubmit={(event) => handleSubmit(onValidSubmit)(event)} noValidate>
          <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
            <label className="sm:col-span-2">
              <span className="text-sm font-semibold text-slate-700">
                Họ và tên <span className="text-red-500">*</span>
              </span>
              <Input
                autoFocus
                className="mt-2 min-h-10"
                placeholder="Nguyễn Văn An"
                aria-invalid={Boolean(errors.fullName)}
                {...register("fullName")}
              />
              <FieldError>{errors.fullName?.message}</FieldError>
            </label>

            <label>
              <span className="text-sm font-semibold text-slate-700">
                Email <span className="text-red-500">*</span>
              </span>
              <Input
                type="email"
                className="mt-2 min-h-10"
                placeholder="user@company.vn"
                aria-invalid={Boolean(errors.email)}
                {...register("email")}
              />
              <FieldError>{errors.email?.message}</FieldError>
            </label>

            <label>
              <span className="text-sm font-semibold text-slate-700">
                Số điện thoại
              </span>
              <Input
                type="tel"
                className="mt-2 min-h-10"
                placeholder="0901 234 567"
                aria-invalid={Boolean(errors.phone)}
                {...register("phone")}
              />
              <FieldError>{errors.phone?.message}</FieldError>
            </label>

            <label className="sm:col-span-2">
              <span className="text-sm font-semibold text-slate-700">
                Phòng ban
              </span>
              <Input
                className="mt-2 min-h-10"
                placeholder="Ví dụ: Kế toán, Vận hành, Công nghệ thông tin..."
                aria-invalid={Boolean(errors.department)}
                {...register("department")}
              />
              <FieldError>{errors.department?.message}</FieldError>
            </label>

            {/* Ô nhập mật khẩu kèm nút ẩn/hiện mật khẩu */}
            <label>
              <span className="text-sm font-semibold text-slate-700">
                Mật khẩu{" "}
                {isEditing ? (
                  <span className="font-normal text-slate-400">
                    (để trống nếu giữ nguyên)
                  </span>
                ) : (
                  <span className="text-red-500">*</span>
                )}
              </span>
              <span className="relative block">
                <Input
                  type={showPassword ? "text" : "password"}
                  className="mt-2 min-h-10 pr-10"
                  placeholder="Ít nhất 8 ký tự (A-Z, a-z, 0-9)"
                  aria-invalid={Boolean(errors.password)}
                  {...register("password")}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute top-1/2 right-1 mt-1 flex size-8 -translate-y-1/2 items-center justify-center text-slate-500"
                  aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                >
                  {showPassword ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                </button>
              </span>
              <FieldError>{errors.password?.message}</FieldError>
            </label>

            {/* Ô xác nhận mật khẩu đồng bộ trạng thái ẩn/hiện */}
            <label>
              <span className="text-sm font-semibold text-slate-700">
                Xác nhận mật khẩu{" "}
                {!isEditing ? <span className="text-red-500">*</span> : null}
              </span>
              <Input
                type={showPassword ? "text" : "password"}
                className="mt-2 min-h-10"
                placeholder="Nhập lại mật khẩu"
                aria-invalid={Boolean(errors.confirmPassword)}
                {...register("confirmPassword")}
              />
              <FieldError>{errors.confirmPassword?.message}</FieldError>
            </label>

            {/* Phân quyền vai trò và trạng thái khóa/hoạt động */}
            <label>
              <span className="text-sm font-semibold text-slate-700">
                Vai trò
              </span>
              <select className={selectClasses} {...register("role")}>
                <option value="user">Người dùng</option>
                <option value="technician">Kỹ thuật viên</option>
                <option value="admin">Quản trị viên</option>
              </select>
            </label>

            <label>
              <span className="text-sm font-semibold text-slate-700">
                Trạng thái
              </span>
              <select className={selectClasses} {...register("status")}>
                <option value="active">Đang hoạt động</option>
                <option value="locked">Bị khóa</option>
              </select>
            </label>
          </div>

          {/* Chân modal chứa nút Hủy và Lưu */}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Hủy
            </Button>
            <Button type="submit" variant="primary" disabled={isSubmitting}>
              {isSubmitting ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : null}
              {isSubmitting
                ? "Đang lưu..."
                : isEditing
                  ? "Lưu thay đổi"
                  : "Thêm người dùng"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default UserFormModal;
