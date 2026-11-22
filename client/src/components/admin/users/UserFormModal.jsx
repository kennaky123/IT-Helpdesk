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

const selectClasses =
  "mt-2 min-h-10 w-full rounded-lg border border-brand-bone bg-white px-3.5 text-sm text-brand-ink outline-none transition focus:border-brand-violet focus:ring-2 focus:ring-brand-violet/20";

function createUserFormSchema(users, editingId) {
  return z
    .object({
      fullName: z.string().trim().min(2, "Họ và tên phải có ít nhất 2 ký tự."),
      email: z
        .string()
        .trim()
        .email("Email không đúng định dạng.")
        .refine(
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

      if (data.password !== data.confirmPassword) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["confirmPassword"],
          message: "Mật khẩu xác nhận không khớp.",
        });
      }
    });
}

function FieldError({ children }) {
  return children ? (
    <p className="mt-1.5 text-xs text-red-600" role="alert">
      {children}
    </p>
  ) : null;
}

function UserFormModal({ user, users, onClose, onSave }) {
  const isEditing = Boolean(user);
  const [showPassword, setShowPassword] = useState(false);

  const schema = useMemo(
    () => createUserFormSchema(users, user?.id),
    [users, user?.id],
  );

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

  async function onValidSubmit(values) {
    try {
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
        if (!open && !isSubmitting) onClose();
      }}
    >
      <DialogContent className="max-w-2xl p-0">
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
