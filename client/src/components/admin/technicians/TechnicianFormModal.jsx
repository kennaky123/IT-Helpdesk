import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle, UserCog } from "lucide-react";
import { useMemo } from "react";
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
  name: "",
  email: "",
  phone: "",
  specialization: "",
  status: "online",
  password: "",
};

const selectClasses =
  "mt-2 min-h-10 w-full rounded-lg border border-brand-bone bg-white px-3.5 text-sm text-brand-ink outline-none transition focus:border-brand-violet focus:ring-2 focus:ring-brand-violet/20";

function createTechnicianSchema(technicians, editingId, isEditing) {
  return z
    .object({
      name: z.string().trim().min(2, "Họ và tên phải có ít nhất 2 ký tự."),
      email: z
        .string()
        .trim()
        .email("Email không đúng định dạng.")
        .refine(
          (value) =>
            !technicians.some(
              (item) =>
                item.id !== editingId &&
                item.email.toLowerCase() === value.toLowerCase(),
            ),
          "Email này đã được sử dụng.",
        ),
      phone: z
        .string()
        .trim()
        .regex(/^[0-9+().\s-]{8,20}$/, "Số điện thoại không hợp lệ."),
      specialization: z
        .string()
        .trim()
        .min(2, "Vui lòng nhập chuyên môn của kỹ thuật viên."),
      status: z.enum(["online", "busy", "offline"]),
      password: z.string(),
    })
    .superRefine((data, ctx) => {
      if (!isEditing && !/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(data.password)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["password"],
          message:
            "Mật khẩu cần ít nhất 8 ký tự, gồm chữ hoa, chữ thường và số.",
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

function TechnicianFormModal({ technician, technicians, onClose, onSave }) {
  const isEditing = Boolean(technician);

  const schema = useMemo(
    () => createTechnicianSchema(technicians, technician?.id, isEditing),
    [technicians, technician?.id, isEditing],
  );

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: technician
      ? {
          name: technician.name ?? "",
          email: technician.email ?? "",
          phone: technician.phone ?? "",
          specialization: technician.specialization ?? "",
          status: technician.status ?? "online",
          password: "",
        }
      : EMPTY_FORM,
  });

  async function onValidSubmit(values) {
    try {
      await onSave({
        ...values,
        name: values.name.trim(),
        email: values.email.trim().toLowerCase(),
        phone: values.phone.trim(),
        specialization: values.specialization.trim(),
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
            <UserCog className="size-5" />
          </span>
          <div>
            <DialogTitle>
              {isEditing ? "Chỉnh sửa kỹ thuật viên" : "Thêm kỹ thuật viên"}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {isEditing
                ? "Cập nhật thông tin và trạng thái làm việc."
                : "Thêm thành viên mới vào đội hỗ trợ."}
            </DialogDescription>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit(onValidSubmit)} noValidate>
          <div className="grid gap-5 p-5 sm:grid-cols-2 sm:p-6">
            <label className="sm:col-span-2">
              <span className="text-sm font-semibold text-slate-700">
                Họ và tên <span className="text-red-500">*</span>
              </span>
              <Input
                autoFocus
                className="mt-2 min-h-10"
                placeholder="Nguyễn Văn An"
                aria-invalid={Boolean(errors.name)}
                {...register("name")}
              />
              <FieldError>{errors.name?.message}</FieldError>
            </label>

            <label>
              <span className="text-sm font-semibold text-slate-700">
                Email <span className="text-red-500">*</span>
              </span>
              <Input
                type="email"
                className="mt-2 min-h-10"
                placeholder="kythuat@company.vn"
                aria-invalid={Boolean(errors.email)}
                {...register("email")}
              />
              <FieldError>{errors.email?.message}</FieldError>
            </label>

            <label>
              <span className="text-sm font-semibold text-slate-700">
                Số điện thoại <span className="text-red-500">*</span>
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

            <label>
              <span className="text-sm font-semibold text-slate-700">
                Chuyên môn <span className="text-red-500">*</span>
              </span>
              <Input
                className="mt-2 min-h-10"
                placeholder="Phần cứng · Mạng"
                aria-invalid={Boolean(errors.specialization)}
                {...register("specialization")}
              />
              <FieldError>{errors.specialization?.message}</FieldError>
            </label>

            <label>
              <span className="text-sm font-semibold text-slate-700">
                Trạng thái
              </span>
              <select className={selectClasses} {...register("status")}>
                <option value="online">Sẵn sàng</option>
                <option value="busy">Đang bận</option>
                <option value="offline">Ngoại tuyến</option>
              </select>
            </label>

            {!isEditing ? (
              <label className="sm:col-span-2">
                <span className="text-sm font-semibold text-slate-700">
                  Mật khẩu ban đầu <span className="text-red-500">*</span>
                </span>
                <Input
                  type="password"
                  className="mt-2 min-h-10"
                  autoComplete="new-password"
                  placeholder="Tối thiểu 8 ký tự, có chữ hoa và số"
                  aria-invalid={Boolean(errors.password)}
                  {...register("password")}
                />
                <FieldError>{errors.password?.message}</FieldError>
              </label>
            ) : null}
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
              {isEditing ? "Lưu thay đổi" : "Thêm kỹ thuật viên"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default TechnicianFormModal;
