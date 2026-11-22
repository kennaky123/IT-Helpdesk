/**
 * @file TicketConversation.jsx
 * @description Component hiển thị luồng trao đổi bình luận công khai và ghi chú kỹ thuật nội bộ của ticket.
 *
 * Props của `TicketConversation`:
 * - `comments` {{ comments: Array<Object> } | null}: Dữ liệu danh sách bình luận đã tải từ API.
 * - `error` {string | null}: Thông báo lỗi nếu quá trình tải bình luận thất bại.
 * - `loading` {boolean}: Cờ hiển thị trạng thái skeleton khi đang tải danh sách trao đổi.
 * - `canComment` {boolean}: Quyền được phép gửi bình luận mới trên ticket hiện tại.
 * - `canCreateInternalNote` {boolean}: Quyền được chuyển sang chế độ ghi chú nội bộ IT (chỉ kỹ thuật viên).
 * - `onRetry` {Function}: Callback thử tải lại danh sách bình luận khi gặp lỗi.
 * - `onSubmit` {Function}: Hàm async `(content, isInternal) => Promise` gửi bình luận công khai hoặc ghi chú nội bộ.
 *
 * Vai trò: Là khu vực giao tiếp chính trong màn hình chi tiết ticket, hỗ trợ phân biệt rõ bình luận
 * công khai gửi tới người yêu cầu và ghi chú nội bộ chỉ IT nhìn thấy, chèn mẫu câu trả lời nhanh
 * (`CANNED_RESPONSES`) và gửi nhanh bằng phím tắt `Ctrl+Enter` / `Cmd+Enter`.
 */
import {
  LoaderCircle,
  LockKeyhole,
  MessageSquare,
  RefreshCw,
  Send,
} from "lucide-react";
import { useState } from "react";
import { CANNED_RESPONSES } from "../../../data/itsmData.js";
import { getTicketActionError } from "../../../services/ticketService.js";
import { formatTicketDateTime } from "../../../utils/ticketPermissions.js";

// Nhãn tiếng Việt tương ứng với vai trò của người gửi bình luận công khai
const ROLE_LABELS = {
  user: "Người yêu cầu",
  technician: "Kỹ thuật viên IT",
  admin: "Quản trị viên IT",
};

/**
 * Lấy tối đa 2 chữ cái đầu từ họ tên để hiển thị trong avatar người gửi.
 * @param {string} name
 * @returns {string}
 */
function getInitials(name) {
  return String(name || "?")
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

/**
 * Hiển thị một thẻ bình luận công khai hoặc ghi chú nội bộ IT trong luồng trao đổi.
 */
function CommentItem({ comment }) {
  return (
    <li
      className={[
        "rounded-xl border p-4 shadow-2xs transition-all",
        comment.isInternal
          ? "border-amber-300 bg-amber-50/70"
          : "border-brand-bone bg-white",
      ].join(" ")}
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span
            className={[
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white",
              comment.isInternal ? "bg-amber-600" : "bg-brand-violet",
            ].join(" ")}
            aria-hidden="true"
          >
            {getInitials(comment.sender.fullName)}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-brand-ink">
              {comment.sender.fullName}
            </span>
            {/* Phân biệt nhãn Ghi Chú Nội Bộ IT với Phản Hồi Công Khai theo cờ isInternal */}
            {comment.isInternal ? (
              <span className="inline-flex items-center gap-1 rounded bg-amber-200/80 px-2 py-0.5 text-[10px] font-bold text-amber-900 uppercase">
                <LockKeyhole className="size-3" aria-hidden="true" />
                Ghi Chú Nội Bộ IT
              </span>
            ) : (
              <span className="rounded bg-brand-violet/10 px-2 py-0.5 text-[10px] font-bold text-brand-violet">
                {ROLE_LABELS[comment.sender.role] ?? "Phản Hồi Công Khai"}
              </span>
            )}
          </div>
        </div>
        <time
          className="font-mono text-xs text-brand-ash"
          dateTime={comment.createdAt}
        >
          {formatTicketDateTime(comment.createdAt)}
        </time>
      </div>
      <p className="pl-9 text-sm leading-relaxed whitespace-pre-wrap wrap-break-word text-brand-ink">
        {comment.content}
      </p>
    </li>
  );
}

/**
 * Component hiển thị danh sách trao đổi của ticket cùng khung soạn bình luận công khai / ghi chú nội bộ.
 */
function TicketConversation({
  comments,
  error,
  loading,
  canComment,
  canCreateInternalNote,
  onRetry,
  onSubmit,
}) {
  // State lưu nội dung đang soạn, chế độ gửi nội bộ, trạng thái submit và lỗi gửi
  const [content, setContent] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  // Hàm kiểm tra độ dài (1-5000 ký tự) và gọi callback gửi bình luận/ghi chú lên server
  async function submitComment() {
    const normalizedContent = content.trim();

    if (!normalizedContent || normalizedContent.length > 5000) {
      setSubmitError({
        message: "Nội dung trao đổi phải có từ 1 đến 5000 ký tự.",
        details: [],
      });
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      await onSubmit(normalizedContent, isInternal);
      setContent("");
    } catch (requestError) {
      setSubmitError(getTicketActionError(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  // Handler submit form khi người dùng bấm nút gửi
  async function handleSubmit(event) {
    event.preventDefault();
    await submitComment();
  }

  // Handler lắng nghe phím tắt Ctrl+Enter hoặc Cmd+Enter để gửi nhanh nội dung đang soạn
  function handleKeyDown(event) {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      if (!submitting && content.trim().length > 0) {
        submitComment();
      }
    }
  }

  // Handler chèn nội dung mẫu câu trả lời nhanh (Canned Response) vào khung soạn thảo
  function handleInsertCannedResponse(event) {
    const idx = event.target.value;
    if (idx === "") return;
    const template = CANNED_RESPONSES[Number(idx)];
    if (template?.content) {
      setContent((prev) =>
        prev ? `${prev}\n${template.content}` : template.content,
      );
      setSubmitError(null);
    }
    event.target.value = "";
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <MessageSquare
            className="size-4 text-brand-violet"
            aria-hidden="true"
          />
          <h2 className="font-display text-sm font-bold text-brand-ink">
            Luồng Trao Đổi & Ghi Chú Kỹ Thuật
          </h2>
        </div>
        {error ? (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold text-brand-violet hover:bg-brand-violet/10"
          >
            <RefreshCw className="size-3.5" aria-hidden="true" />
            Thử lại
          </button>
        ) : null}
      </div>

      {/* Trạng thái skeleton khi đang tải danh sách trao đổi */}
      {loading ? (
        <div className="space-y-3" aria-label="Đang tải trao đổi">
          {[1, 2].map((item) => (
            <div
              key={item}
              className="h-24 animate-pulse rounded-xl bg-white/80"
            />
          ))}
        </div>
      ) : null}

      {/* Thông báo lỗi khi tải bình luận thất bại */}
      {!loading && error ? (
        <p
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {/* Trạng thái rỗng khi ticket chưa có phản hồi nào */}
      {!loading && !error && comments?.comments.length === 0 ? (
        <div className="rounded-xl border border-brand-bone bg-white px-4 py-6 text-center">
          <p className="text-xs font-semibold text-brand-slate">
            Chưa có phản hồi hoặc ghi chú nào trên ticket này.
          </p>
        </div>
      ) : null}

      {/* Danh sách các bình luận công khai và ghi chú nội bộ */}
      {!loading && !error && comments?.comments.length > 0 ? (
        <ol className="space-y-3">
          {comments.comments.map((comment) => (
            <CommentItem key={comment._id} comment={comment} />
          ))}
        </ol>
      ) : null}

      {/* Reply Composer Box (Matches DeskPro IT View 2) */}
      {/* Khung soạn phản hồi: chỉ hiển thị khi người dùng có quyền bình luận */}
      {canComment ? (
        <form
          onSubmit={handleSubmit}
          className="rounded-xl border border-brand-bone bg-white p-4 shadow-xs"
        >
          <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
            {/* Bộ nút chuyển chế độ giữa Phản hồi công khai và Ghi chú nội bộ IT */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setIsInternal(false)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                  !isInternal
                    ? "bg-brand-ink text-white"
                    : "text-brand-slate hover:bg-brand-mist"
                }`}
              >
                Phản Hồi Công Khai (Gửi User)
              </button>
              {canCreateInternalNote ? (
                <button
                  type="button"
                  onClick={() => setIsInternal(true)}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                    isInternal
                      ? " border border-amber-300 bg-amber-100 text-amber-900"
                      : "text-brand-slate hover:bg-brand-mist"
                  }`}
                >
                  <LockKeyhole className="size-3.5" aria-hidden="true" />
                  Ghi Chú Nội Bộ (Chỉ IT Thấy)
                </button>
              ) : null}
            </div>

            {/* Canned Responses Dropdown */}
            <select
              onChange={handleInsertCannedResponse}
              defaultValue=""
              aria-label="Mẫu câu trả lời nhanh"
              className="rounded-lg border border-brand-bone bg-brand-mist px-2.5 py-1 text-xs font-medium text-brand-slate outline-none hover:text-brand-ink"
            >
              <option value="">
                + Mẫu câu trả lời nhanh (Canned Responses)...
              </option>
              {CANNED_RESPONSES.map((item, idx) => (
                <option key={item.id} value={String(idx)}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>

          <div
            className={`overflow-hidden rounded-xl border transition-all focus-within:ring-2 ${
              isInternal
                ? "border-amber-300 bg-amber-50/40 focus-within:border-amber-500 focus-within:ring-amber-200"
                : "border-brand-bone bg-brand-mist/50 focus-within:border-brand-violet focus-within:ring-brand-violet/20"
            }`}
          >
            <textarea
              id="ticket-comment"
              value={content}
              maxLength={5000}
              rows={3}
              disabled={submitting}
              onKeyDown={handleKeyDown}
              onChange={(event) => {
                setContent(event.target.value);
                setSubmitError(null);
              }}
              placeholder={
                isInternal
                  ? "Ghi chú kỹ thuật nội bộ (Người yêu cầu sẽ KHÔNG nhìn thấy nội dung này)..."
                  : "Nhập phản hồi cho người yêu cầu (Nhấn Ctrl + Enter để gửi nhanh)..."
              }
              className="w-full resize-none bg-transparent p-3 text-sm text-brand-ink outline-none placeholder:text-brand-ash"
            />
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-brand-bone bg-white px-3 py-2">
              <span className="text-[11px] text-brand-ash">
                {content.length}/5000 ký tự • Nhấn{" "}
                <kbd className="rounded bg-brand-mist px-1 py-0.5 font-mono text-[10px] text-brand-slate">
                  Ctrl+Enter
                </kbd>{" "}
                để gửi
              </span>
              <button
                type="submit"
                disabled={submitting || content.trim().length === 0}
                className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-semibold text-white shadow-xs transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
                  isInternal
                    ? "bg-amber-600 hover:bg-amber-700"
                    : "bg-brand-violet hover:bg-brand-violet/90"
                }`}
              >
                {submitting ? (
                  <LoaderCircle
                    className="size-3.5 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <Send className="size-3.5" aria-hidden="true" />
                )}
                {submitting
                  ? "Đang gửi..."
                  : isInternal
                    ? "Lưu Ghi Chú Nội Bộ"
                    : "Gửi Phản Hồi"}
              </button>
            </div>
          </div>

          {/* Hiển thị lỗi validate hoặc lỗi trả về từ API khi gửi bình luận */}
          {submitError ? (
            <div
              className="mt-2.5 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800"
              role="alert"
            >
              <p>{submitError.message}</p>
              {submitError.details.length > 0 ? (
                <ul className="mt-1 list-disc pl-5">
                  {submitError.details.map((detail) => (
                    <li key={detail}>{detail}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </form>
      ) : (
        /* Thông báo khi ticket đã đóng/hủy hoặc vai trò hiện tại chỉ có quyền xem */
        <p className="rounded-xl border border-brand-bone bg-white px-4 py-3 text-xs text-brand-slate">
          Ticket đang ở chế độ chỉ đọc hoặc vai trò của bạn không được gửi bình
          luận.
        </p>
      )}
    </section>
  );
}

export default TicketConversation;
