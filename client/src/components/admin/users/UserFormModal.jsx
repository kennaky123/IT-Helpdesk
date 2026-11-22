import { Eye, EyeOff, LoaderCircle, UserPlus } from "lucide-react";
import { useState } from "react";
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

function validate(values, users, editingId) {
  const errors = {};
  if (values.fullName.trim().length < 2) {
    errors.fullName = "Họ và tên phải có ít nhất 2 ký tự.";
  }
  if (!/^\S+@\S+\.\S+$/.test(values.email.trim())) {
    errors.email = "Email không đúng định dạng.";
  } else if (
    users.some(
      (user) =>
        user.id !== editingId &&
        user.email.toLowerCase() === values.email.trim().toLowerCase(),
    )
  ) {
    errors.email = "Email này đã được sử dụng.";
  }

  const trimmedPhone = values.phone.trim();
  if (trimmedPhone && !/^[0-9+().\s-]{8,20}$/.test(trimmedPhone)) {
    errors.phone = "Số điện thoại không đúng định dạng.";
  }

  if (!editingId || values.password) {
    if (values.password.length < 8) {
      errors.password = "Mật khẩu phải có ít nhất 8 ký tự.";
    } else if (
      !/[a-z]/.test(values.password) ||
      !/[A-Z]/.test(values.password) ||
      !/\d/.test(values.password)
    ) {
      errors.password = "Mật khẩu cần gồm chữ thường, chữ hoa và chữ số.";
    }
  }

  if (values.password !== values.confirmPassword) {
    errors.confirmPassword = "Mật khẩu xác nhận không khớp.";
  }

  return errors;
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
  const [values, setValues] = useState(() =>
    user
      ? {
          ...EMPTY_FORM,
          ...user,
          department: user.department ?? "",
          status: user.status === "locked" ? "locked" : "active",
          password: "",
          confirmPassword: "",
        }
      : EMPTY_FORM,
  );
  const [errors, setErrors] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function updateField(name, value) {
    setValues((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: undefined }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const nextErrors = validate(values, users, user?.id);
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }

    setSubmitting(true);
    try {
      await onSave({
        ...values,
        fullName: values.fullName.trim(),
        email: values.email.trim(),
        phone: values.phone.trim(),
        department: values.department.trim(),
      });
    } catch {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !submitting) onClose(); }}>
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
                : "Tạo tài khoản mới vào cơ sở dữ liệu PostgreSQL."}
            </DialogDescription>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} noValidate>
          <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
            <label className="sm:col-span-2">
              <span className="text-sm font-semibold text-slate-700">
                Họ và tên <span className="text-red-500">*</span>
              </span>
              <Input
                autoFocus
                value={values.fullName}
                onChange={(event) => updateField("fullName", event.target.value)}
                className="mt-2 min-h-10"
                placeholder="Nguyễn Văn An"
                aria-invalid={Boolean(errors.fullName)}
              />
              <FieldError>{errors.fullName}</FieldError>
            </label>

            <label>
              <span className="text-sm font-semibold text-slate-700">
                Email <span className="text-red-500">*</span>
              </span>
              <Input
                type="email"
                value={values.email}
                onChange={(event) => updateField("email", event.target.value)}
                className="mt-2 min-h-10"
                placeholder="user@company.vn"
                aria-invalid={Boolean(errors.email)}
              />
              <FieldError>{errors.email}</FieldError>
            </label>

            <label>
              <span className="text-sm font-semibold text-slate-700">
                Số điện thoại
              </span>
              <Input
                type="tel"
                value={values.phone}
                onChange={(event) => updateField("phone", event.target.value)}
                className="mt-2 min-h-10"
                placeholder="0901 234 567"
                aria-invalid={Boolean(errors.phone)}
              />
              <FieldError>{errors.phone}</FieldError>
            </label>

            <label className="sm:col-span-2">
              <span className="text-sm font-semibold text-slate-700">
                Phòng ban
              </span>
              <Input
                value={values.department}
                onChange={(event) => updateField("department", event.target.value)}
                className="mt-2 min-h-10"
                placeholder="Ví dụ: Kế toán, Vận hành, Công nghệ thông tin..."
              />
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
                  value={values.password}
                  onChange={(event) => updateField("password", event.target.value)}
                  className="mt-2 min-h-10 pr-10"
                  placeholder="Ít nhất 8 ký tự (A-Z, a-z, 0-9)"
                  aria-invalid={Boolean(errors.password)}
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
              <FieldError>{errors.password}</FieldError>
            </label>

            <label>
              <span className="text-sm font-semibold text-slate-700">
                Xác nhận mật khẩu{" "}
                {!isEditing ? <span className="text-red-500">*</span> : null}
              </span>
              <Input
                type={showPassword ? "text" : "password"}
                value={values.confirmPassword}
                onChange={(event) =>
                  updateField("confirmPassword", event.target.value)
                }
                className="mt-2 min-h-10"
                placeholder="Nhập lại mật khẩu"
                aria-invalid={Boolean(errors.confirmPassword)}
              />
              <FieldError>{errors.confirmPassword}</FieldError>
            </label>

            <label>
              <span className="text-sm font-semibold text-slate-700">
                Vai trò
              </span>
              <select
                value={values.role}
                onChange={(event) => updateField("role", event.target.value)}
                className={selectClasses}
              >
                <option value="user">Người dùng</option>
                <option value="technician">Kỹ thuật viên</option>
                <option value="admin">Quản trị viên</option>
              </select>
            </label>

            <label>
              <span className="text-sm font-semibold text-slate-700">
                Trạng thái
              </span>
              <select
                value={values.status}
                onChange={(event) => updateField("status", event.target.value)}
                className={selectClasses}
              >
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
              disabled={submitting}
            >
              Hủy
            </Button>
            <Button type="submit" variant="primary" disabled={submitting}>
              {submitting ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : null}
              {submitting
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
