/**
 * Modal biểu mẫu tạo mới và chỉnh sửa thông tin kỹ thuật viên (Technician) trong module quản lý Admin.
 *
 * Props:
 * - technician: Đối tượng kỹ thuật viên cần chỉnh sửa (null/undefined nếu đang tạo mới).
 * - technicians: Danh sách toàn bộ kỹ thuật viên hiện có để kiểm tra trùng lặp email.
 * - onClose: Callback đóng modal khi người dùng hủy hoặc nhấn ra ngoài.
 * - onSave: Callback async nhận payload dữ liệu hợp lệ để gọi API tạo/cập nhật kỹ thuật viên.
 */
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

// Giá trị khởi tạo mặc định khi mở modal ở chế độ thêm kỹ thuật viên mới
const EMPTY_FORM = {
  name: "",
  email: "",
  phone: "",
  specialization: "",
  status: "online",
  password: "",
};

// Class CSS dùng chung cho thẻ select chọn trạng thái làm việc
const selectClasses =
  "mt-2 min-h-10 w-full rounded-lg border border-brand-bone bg-white px-3.5 text-sm text-brand-ink outline-none transition focus:border-brand-violet focus:ring-2 focus:ring-brand-violet/20";

/**
 * Khởi tạo schema Zod để validate dữ liệu kỹ thuật viên.
 * Kiểm tra định dạng các trường, tính duy nhất của email và độ mạnh mật khẩu khi tạo mới.
 */
function createTechnicianSchema(technicians, editingId, isEditing) {
  return z
    .object({
      name: z.string().trim().min(2, "Họ và tên phải có ít nhất 2 ký tự."),
      email: z
        .string()
        .trim()
        .email("Email không đúng định dạng.")
        .refine(
          // Đảm bảo email không trùng với kỹ thuật viên khác (bỏ qua chính bản ghi đang sửa)
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
      // Chỉ bắt buộc nhập và kiểm tra độ phức tạp mật khẩu khi tạo mới tài khoản
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

/**
 * Component phụ hiển thị thông báo lỗi validation ngay bên dưới từng ô nhập liệu.
 */
function FieldError({ children }) {
  return children ? (
    <p className="mt-1.5 text-xs text-red-600" role="alert">
      {children}
    </p>
  ) : null;
}

/**
 * Component modal chính quản lý form thêm mới hoặc cập nhật kỹ thuật viên.
 */
function TechnicianFormModal({ technician, technicians, onClose, onSave }) {
  // Xác định chế độ sửa hay tạo mới dựa trên prop technician
  const isEditing = Boolean(technician);

  // Memoize schema validation để chỉ tạo lại khi danh sách kỹ thuật viên hoặc đối tượng đang sửa thay đổi
  const schema = useMemo(
    () => createTechnicianSchema(technicians, technician?.id, isEditing),
    [technicians, technician?.id, isEditing],
  );

  // Cấu hình React Hook Form kết hợp zodResolver và đổ dữ liệu ban đầu vào form
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

  // Handler xử lý submit sau khi form đã vượt qua toàn bộ bước validate của Zod
  async function onValidSubmit(values) {
    try {
      // Chuẩn hóa khoảng trắng và chuyển email về chữ thường trước khi gửi lên component cha
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
        // Chỉ cho phép đóng dialog khi không trong quá trình gửi API
        if (!open && !isSubmitting) onClose();
      }}
    >
      <DialogContent className="max-w-2xl p-0">
        {/* Phần tiêu đề modal kèm icon nhận diện */}
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

        {/* Form nhập liệu, tắt validate mặc định của trình duyệt để dùng Zod */}
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

            {/* Chỉ hiển thị ô nhập mật khẩu ban đầu khi thêm kỹ thuật viên mới */}
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

          {/* Chân modal chứa nút Hủy và Submit */}
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
