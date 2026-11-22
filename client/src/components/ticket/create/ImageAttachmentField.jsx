/**
 * ImageAttachmentField.jsx
 *
 * Chức năng: Cung cấp trường chọn/kéo-thả ảnh đính kèm và lưới xem trước (preview) ảnh đã chọn.
 * Props:
 * - `attachments` (Array): Danh sách object ảnh `{ id, file, previewUrl }` đang gắn vào form.
 * - `disabled` (boolean): Vô hiệu hóa chọn/kéo-thả/xóa ảnh khi form đang gửi lên server.
 * - `error` (string): Thông báo lỗi kiểm tra tệp ảnh (sai định dạng, vượt dung lượng, vượt số lượng, trùng ảnh).
 * - `maxFiles` (number): Số lượng ảnh tối đa được phép đính kèm cho mỗi ticket.
 * - `maxFileSizeMb` (number): Dung lượng tối đa (MB) cho từng ảnh.
 * - `onFilesSelected` (function): Callback nhận mảng `File` sau khi người dùng chọn hoặc thả ảnh.
 * - `onRemove` (function): Callback xóa ảnh khỏi danh sách theo `attachment.id`.
 * Vai trò: Đóng vai trò giao diện upload và quản lý preview ảnh trong luồng tạo mới ticket.
 */
import { useId, useState } from "react";
import { ImagePlus, Trash2, UploadCloud } from "lucide-react";

// Helper định dạng dung lượng file từ byte sang KB (tối thiểu 1 KB) hoặc MB để hiển thị dưới mỗi ảnh preview
function formatFileSize(sizeBytes) {
  if (sizeBytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(sizeBytes / 1024))} KB`;
  }

  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Component trường đính kèm hình ảnh hỗ trợ click chọn file, kéo-thả (drag & drop) và xem trước thumbnail
function ImageAttachmentField({
  attachments,
  disabled,
  error,
  maxFiles,
  maxFileSizeMb,
  onFilesSelected,
  onRemove,
}) {
  // Tạo ID duy nhất cho input file, mô tả định dạng và thông báo lỗi để đảm bảo accessibility
  const inputId = useId();
  const descriptionId = `${inputId}-description`;
  const errorId = `${inputId}-error`;
  // State theo dõi trạng thái con trỏ đang kéo file vào vùng dropzone để đổi màu viền phản hồi
  const [isDragging, setIsDragging] = useState(false);

  // Xử lý sự kiện chọn tệp từ hộp thoại duyệt file; reset value để cho phép chọn lại cùng file nếu vừa xóa
  function handleFileInput(event) {
    onFilesSelected(Array.from(event.target.files ?? []));
    event.target.value = "";
  }

  // Ngăn trình duyệt mở ảnh trực tiếp và bật trạng thái highlight vùng thả khi đang kéo file vào
  function handleDragOver(event) {
    event.preventDefault();

    if (!disabled) {
      setIsDragging(true);
    }
  }

  // Xử lý khi người dùng thả file vào vùng dropzone: tắt highlight và chuyển danh sách file lên component cha
  function handleDrop(event) {
    event.preventDefault();
    setIsDragging(false);

    if (!disabled) {
      onFilesSelected(Array.from(event.dataTransfer.files ?? []));
    }
  }

  return (
    <div>
      {/* Nhãn trường và bộ đếm số lượng ảnh đã chọn trên giới hạn tối đa */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="text-sm font-semibold text-slate-800" htmlFor={inputId}>
          Hình ảnh đính kèm
          <span className="ml-1 font-normal text-slate-500">(không bắt buộc)</span>
        </label>
        <span className="text-xs font-medium text-slate-500">
          {attachments.length}/{maxFiles} ảnh
        </span>
      </div>

      {/* Input file ẩn (sr-only), tự khóa khi đang submit hoặc đã đủ số lượng ảnh tối đa */}
      <input
        id={inputId}
        type="file"
        className="sr-only"
        accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
        multiple
        disabled={disabled || attachments.length >= maxFiles}
        aria-describedby={`${descriptionId}${error ? ` ${errorId}` : ""}`}
        aria-invalid={Boolean(error)}
        onChange={handleFileInput}
      />

      {/* Vùng label đóng vai trò dropzone kéo-thả hoặc click để mở hộp thoại chọn ảnh */}
      <label
        htmlFor={inputId}
        onDragEnter={handleDragOver}
        onDragOver={handleDragOver}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={[
          "mt-2 flex min-h-36 flex-col items-center justify-center rounded-xl border-2 border-dashed px-5 py-6 text-center transition-colors",
          disabled || attachments.length >= maxFiles
            ? "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400"
            : "cursor-pointer border-slate-300 bg-slate-50/70 hover:border-blue-400 hover:bg-blue-50/50",
          isDragging ? "border-blue-500 bg-blue-50" : "",
          error ? "border-red-300 bg-red-50/40" : "",
        ].join(" ")}
      >
        <span className="flex size-11 items-center justify-center rounded-xl bg-white text-blue-600 shadow-sm ring-1 ring-slate-200">
          {attachments.length > 0 ? (
            <ImagePlus className="size-5" aria-hidden="true" />
          ) : (
            <UploadCloud className="size-5" aria-hidden="true" />
          )}
        </span>
        <span className="mt-3 text-sm font-semibold text-slate-700">
          Chọn ảnh hoặc kéo thả vào đây
        </span>
        <span id={descriptionId} className="mt-1 text-xs leading-5 text-slate-500">
          JPEG, PNG hoặc WebP; tối đa {maxFileSizeMb} MB mỗi ảnh
        </span>
      </label>

      {/* Thông báo lỗi kiểm tra tệp ảnh (định dạng, dung lượng, trùng lặp hoặc vượt giới hạn) */}
      {error ? (
        <p id={errorId} className="mt-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      {/* Lưới hiển thị các ảnh xem trước (preview) kèm tên file, dung lượng và nút xóa từng ảnh */}
      {attachments.length > 0 ? (
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {attachments.map((attachment) => (
            <li
              key={attachment.id}
              className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
            >
              <div className="relative aspect-square bg-slate-100">
                <img
                  src={attachment.previewUrl}
                  alt={`Ảnh xem trước ${attachment.file.name}`}
                  className="size-full object-cover"
                />
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onRemove(attachment.id)}
                  className="absolute top-2 right-2 flex size-9 items-center justify-center rounded-lg bg-slate-950/75 text-white shadow-sm transition hover:bg-red-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 disabled:cursor-not-allowed disabled:opacity-60"
                  aria-label={`Xóa ảnh ${attachment.file.name}`}
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </button>
              </div>
              <div className="min-w-0 px-3 py-2.5">
                <p className="truncate text-xs font-semibold text-slate-700">
                  {attachment.file.name}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {formatFileSize(attachment.file.size)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export default ImageAttachmentField;
