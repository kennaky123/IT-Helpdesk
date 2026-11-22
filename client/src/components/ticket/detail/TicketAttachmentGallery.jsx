/**
 * @file TicketAttachmentGallery.jsx
 * @description Component hiển thị danh sách ảnh chụp màn hình và tệp đính kèm của ticket.
 *
 * Props:
 * - `ticketId` {string}: ID của ticket dùng để tải blob tệp đính kèm từ endpoint cần xác thực.
 * - `attachments` {Array<Object>}: Danh sách metadata tệp đính kèm (`_id`, `originalName`, `sizeBytes`).
 *
 * Vai trò: Hiển thị trong cột nội dung chính của màn hình chi tiết ticket; tải dữ liệu ảnh bằng
 * token xác thực qua `getTicketAttachmentBlob`, tạo Object URL tạm thời để xem trước dạng lưới
 * và cho phép bấm vào từng ảnh để mở xem ảnh phóng to kích thước đầy đủ ở tab mới.
 */
import { ExternalLink, ImageOff, LoaderCircle, Paperclip } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getTicketAttachmentBlob } from "../../../services/ticketService.js";

/**
 * Định dạng kích thước tệp từ byte sang chuỗi dễ đọc (KB hoặc MB).
 * @param {number} sizeBytes
 * @returns {string}
 */
function formatFileSize(sizeBytes) {
  if (!Number.isFinite(sizeBytes)) {
    return "";
  }

  if (sizeBytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(sizeBytes / 1024))} KB`;
  }

  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Thư viện hiển thị các ảnh đính kèm của ticket và hỗ trợ bấm mở xem phóng to ở tab mới.
 */
function TicketAttachmentGallery({ ticketId, attachments }) {
  // Tạo khóa duy nhất từ ticketId và danh sách ID tệp để đồng bộ trạng thái loading khi đổi ticket
  const attachmentKey = useMemo(
    () =>
      `${ticketId}:${attachments.map((attachment) => attachment._id).join(",")}`,
    [attachments, ticketId],
  );
  // State lưu khóa bộ tệp đã tải xong cùng danh sách URL đối tượng tương ứng
  const [state, setState] = useState({ key: null, items: [] });

  // Effect tải song song toàn bộ blob ảnh có xác thực và thu hồi Object URL khi unmount/thay đổi
  useEffect(() => {
    const abortController = new AbortController();
    const objectUrls = [];

    Promise.all(
      attachments.map(async (attachment) => {
        try {
          const blob = await getTicketAttachmentBlob(ticketId, attachment._id, {
            signal: abortController.signal,
          });
          // Tạo URL bộ nhớ cục bộ từ Blob để thẻ <img> và liên kết phóng to sử dụng trực tiếp
          const url = URL.createObjectURL(blob);
          objectUrls.push(url);
          return { attachment, url, error: false };
        } catch (error) {
          return {
            attachment,
            url: null,
            error: error.code !== "ERR_CANCELED",
          };
        }
      }),
    ).then((items) => {
      if (!abortController.signal.aborted) {
        setState({ key: attachmentKey, items });
      }
    });

    // Dọn dẹp: hủy các request đang chờ và giải phóng toàn bộ Object URL tránh rò rỉ bộ nhớ
    return () => {
      abortController.abort();
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [attachmentKey, attachments, ticketId]);

  // Ẩn hoàn toàn khu vực đính kèm nếu ticket không có tệp nào
  if (!attachments || attachments.length === 0) {
    return null;
  }

  // Xác định đang tải khi state hiện tại chưa khớp với bộ tệp mới nhất
  const isLoading = state.key !== attachmentKey;

  return (
    <section className="rounded-xl border border-brand-bone bg-white p-5 shadow-2xs">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-display text-xs font-bold tracking-wider text-brand-slate uppercase">
          <Paperclip className="size-4 text-brand-violet" aria-hidden="true" />
          Tệp Đính Kèm & Ảnh Chụp Màn Hình
        </h2>
        <span className="rounded-full bg-brand-mist px-2.5 py-0.5 font-mono text-xs font-semibold text-brand-ink">
          {attachments.length} tệp
        </span>
      </div>

      {isLoading ? (
        /* Trạng thái đang tải dữ liệu blob các tệp đính kèm */
        <div
          className="mt-4 flex min-h-24 items-center justify-center rounded-xl bg-brand-mist text-xs text-brand-slate"
          role="status"
        >
          <LoaderCircle
            className="mr-2 size-4 animate-spin"
            aria-hidden="true"
          />
          Đang tải tệp đính kèm...
        </div>
      ) : (
        /* Lưới ảnh đính kèm: mỗi ảnh là liên kết mở tab mới để xem ảnh phóng to */
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {state.items.map(({ attachment, url, error }) => (
            <li
              key={attachment._id}
              className="min-w-0 overflow-hidden rounded-xl border border-brand-bone bg-brand-mist/50"
            >
              {url ? (
                /* Liên kết mở Blob URL sang tab mới giúp xem ảnh rõ nét ở kích thước gốc */
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="group block"
                  aria-label={`Mở ảnh ${attachment.originalName}`}
                >
                  <div className="relative aspect-video overflow-hidden bg-brand-mist">
                    <img
                      src={url}
                      alt={attachment.originalName}
                      className="size-full object-cover transition group-hover:scale-[1.03]"
                    />
                    <span className="absolute right-2 bottom-2 flex size-7 items-center justify-center rounded-lg bg-brand-ink/80 text-white">
                      <ExternalLink className="size-3.5" aria-hidden="true" />
                    </span>
                  </div>
                </a>
              ) : (
                /* Khung dự phòng khi không tải được ảnh hoặc yêu cầu đã bị hủy */
                <div className="flex aspect-video flex-col items-center justify-center bg-brand-mist px-3 text-center text-brand-ash">
                  <ImageOff className="size-5" aria-hidden="true" />
                  <span className="mt-1 text-[11px]">
                    {error ? "Không tải được ảnh" : "Ảnh không khả dụng"}
                  </span>
                </div>
              )}
              <div className="min-w-0 px-3 py-2">
                <p className="truncate text-xs font-semibold text-brand-ink">
                  {attachment.originalName}
                </p>
                <p className="mt-0.5 font-mono text-[11px] text-brand-ash">
                  {formatFileSize(attachment.sizeBytes)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default TicketAttachmentGallery;
