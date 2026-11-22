/**
 * Modal xác nhận dùng chung cho các thao tác quan trọng hoặc mang tính phá hủy dữ liệu
 * (ví dụ: hủy/đóng yêu cầu, thu hồi cấp phát, thao tác cần nhập lý do xác nhận).
 *
 * Props:
 * - title: Tiêu đề của hộp thoại xác nhận.
 * - description: Nội dung mô tả chi tiết hệ quả của hành động.
 * - confirmLabel: Nhãn hiển thị trên nút xác nhận chính.
 * - noteLabel: Nhãn cho ô nhập ghi chú/lý do (nếu không truyền sẽ ẩn ô textarea).
 * - notePlaceholder: Văn bản gợi ý bên trong ô ghi chú.
 * - submitting: Cờ báo đang gửi yêu cầu lên server; khóa thao tác đóng modal và disable nút.
 * - error: Đối tượng lỗi trả về ({ message, details }) để hiển thị cảnh báo ngay trong modal.
 * - onCancel: Callback đóng modal khi người dùng hủy thao tác.
 * - onConfirm: Callback thực thi xác nhận, nhận tham số là chuỗi ghi chú đã được trim().
 *
 * Vai trò trong UI Layout:
 * - Component Common tái sử dụng trên nhiều trang quản trị, kỹ thuật và người dùng.
 */
import { useState } from "react";
import { AlertTriangle, LoaderCircle } from "lucide-react";
import { Button } from "../ui/button.jsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog.jsx";

/**
 * Component hộp thoại xác nhận hành động có hỗ trợ nhập ghi chú tùy chọn và hiển thị lỗi API.
 */
function ConfirmActionModal({
  title,
  description,
  confirmLabel,
  noteLabel,
  notePlaceholder,
  submitting,
  error,
  onCancel,
  onConfirm,
}) {
  // Lưu nội dung ghi chú/lý do người dùng nhập trước khi xác nhận (tối đa 500 ký tự).
  const [note, setNote] = useState("");

  // Chặn đóng modal khi Dialog phát sinh sự kiện đóng (backdrop/ESC) trong lúc API đang xử lý.
  function handleOpenChange(open) {
    if (!open && !submitting) {
      onCancel();
    }
  }

  return (
    <Dialog open onOpenChange={handleOpenChange}>
      {/* Cho phép tắt nút X và chặn ESC/click ngoài khi đang gửi request */}
      <DialogContent
        hideClose={submitting}
        onEscapeKeyDown={(event) => {
          if (submitting) event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          if (submitting) event.preventDefault();
        }}
        className="p-0"
      >
        <DialogHeader className="flex-row items-start gap-4 space-y-0 pr-12">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-700">
            <AlertTriangle className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription className="mt-1.5">
              {description}
            </DialogDescription>
          </div>
        </DialogHeader>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            onConfirm(note.trim());
          }}
        >
          {noteLabel || error ? (
            <div className="p-5 sm:p-6">
              {noteLabel ? (
                <div>
                  <label
                    htmlFor="confirm-action-note"
                    className="text-sm font-semibold text-slate-800"
                  >
                    {noteLabel}
                  </label>
                  <textarea
                    id="confirm-action-note"
                    value={note}
                    maxLength={500}
                    rows={4}
                    disabled={submitting}
                    placeholder={notePlaceholder}
                    onChange={(event) => setNote(event.target.value)}
                    className="mt-2 min-h-28 w-full resize-y rounded-lg border border-slate-300 px-3.5 py-2.5 text-base text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-3 focus:ring-blue-100 disabled:bg-slate-100 sm:text-sm"
                  />
                  <p className="mt-1.5 text-right text-xs text-slate-500">
                    {note.length}/500
                  </p>
                </div>
              ) : null}

              {error ? (
                <div
                  className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800"
                  role="alert"
                >
                  <p>{error.message}</p>
                  {error.details?.length > 0 ? (
                    <ul className="mt-1 list-disc pl-5">
                      {error.details.map((detail) => (
                        <li key={detail}>{detail}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={submitting}
              onClick={onCancel}
            >
              Quay lại
            </Button>
            <Button type="submit" variant="destructive" disabled={submitting}>
              {submitting ? (
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              ) : null}
              {submitting ? "Đang xử lý..." : confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default ConfirmActionModal;
