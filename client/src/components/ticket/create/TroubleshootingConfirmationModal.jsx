/**
 * TroubleshootingConfirmationModal.jsx
 *
 * Chức năng: Hiển thị hộp thoại (modal) gợi ý các bước tự kiểm tra và khắc phục sự cố nhanh
 * trước khi chính thức gửi yêu cầu lên IT Help Desk.
 * Props:
 * - `categoryName` (string): Tên danh mục sự cố đang chọn.
 * - `guides` (Array): Danh sách hướng dẫn tự sửa lỗi phù hợp với danh mục và nội dung ticket.
 * - `ticketTitle` (string): Tiêu đề sự cố người dùng đã nhập trong biểu mẫu.
 * - `isSubmitting` (boolean): Cờ vô hiệu hóa thao tác gửi/đóng modal khi API đang xử lý.
 * - `onClose` (function): Callback đóng modal để quay lại chỉnh sửa biểu mẫu.
 * - `onSelfResolved` (function): Callback xác nhận người dùng đã tự xử lý thành công (không cần tạo ticket).
 * - `onConfirmSendToHelpDesk` (function): Callback xác nhận vẫn gặp lỗi và tiếp tục gửi ticket lên Help Desk.
 * Vai trò: Lớp tự phục vụ (self-service gate) giúp giảm tải ticket phổ thông trong luồng tạo mới ticket.
 */
import { useState } from "react";
import {
  Check,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  HelpCircle,
  Lightbulb,
  Send,
  Sparkles,
  Wrench,
  X,
} from "lucide-react";
import { toast } from "react-toastify";
import { copyTextToClipboard } from "../../../utils/clipboard.js";

// Component modal tự kiểm tra hướng dẫn khắc phục trước khi xác nhận gửi ticket
function TroubleshootingConfirmationModal({
  categoryName = "Sự cố kỹ thuật",
  guides = [],
  ticketTitle = "",
  isSubmitting = false,
  onClose,
  onSelfResolved,
  onConfirmSendToHelpDesk,
}) {
  // State lưu ID bước hướng dẫn vừa sao chép lệnh để hiển thị nhãn "Đã chép" tạm thời trong 2 giây
  const [copiedId, setCopiedId] = useState(null);
  // State lưu tập hợp ID các hướng dẫn người dùng đã đánh dấu là đã thử thực hiện
  const [triedGuides, setTriedGuides] = useState(() => new Set());

  // Handler sao chép câu lệnh gợi ý vào clipboard và cập nhật phản hồi UI
  async function handleCopyCommand(command, id) {
    if (!command) return;
    try {
      await copyTextToClipboard(command);
      setCopiedId(id);
      toast.info(`Đã sao chép: ${command}`);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast.error("Không thể sao chép lệnh.");
    }
  }

  // Handler bật/tắt trạng thái đánh dấu "Đã thử cách này" cho từng hướng dẫn
  function toggleTried(guideId) {
    setTriedGuides((prev) => {
      const next = new Set(prev);
      if (next.has(guideId)) next.delete(guideId);
      else next.add(guideId);
      return next;
    });
  }

  return (
    <div
      onClick={(e) => {
        // Chỉ cho phép bấm ra ngoài nền tối (backdrop) để đóng modal khi không đang gửi ticket lên server
        if (e.target === e.currentTarget && !isSubmitting) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in"
    >
      <div className="w-full max-w-2xl bg-white rounded-2xl border border-brand-bone shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        {/* Phần đầu modal: huy hiệu Self-Service, tên danh mục và nút đóng */}
        <div className="flex items-start justify-between p-5 border-b border-brand-bone bg-brand-mist/60 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-100 text-brand-violet ring-4 ring-purple-50">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-brand-violet uppercase tracking-wider">
                  Trợ Lý Tự Phục Vụ (Self-Service)
                </span>
                <span className="text-xs font-semibold text-brand-slate">
                  • Danh mục: <strong className="text-brand-onyx">{categoryName}</strong>
                </span>
              </div>
              <h2 className="text-base font-bold text-brand-onyx mt-0.5">
                Các Cách Khắc Phục Nhanh Thông Dụng Trước Khi Gửi Ticket
              </h2>
              <p className="text-xs text-brand-slate mt-0.5">
                Rất nhiều nhân viên đã tự xử lý thành công trong 1-2 phút với các bước dưới đây.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-brand-slate hover:text-brand-ink hover:bg-brand-mist transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Guides Scroll Content */}
        {/* Thân modal có thể cuộn: tóm tắt tiêu đề sự cố và danh sách các giải pháp khắc phục từng bước */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          <div className="flex items-center gap-2 p-3 rounded-xl border border-blue-200 bg-blue-50/70 text-xs text-blue-900">
            <Lightbulb className="w-4 h-4 shrink-0 text-blue-600" />
            <span>
              Sự cố bạn đang gặp: <strong className="font-semibold">&quot;{ticketTitle || "Yêu cầu hỗ trợ"}&quot;</strong>.
              Hãy thử làm theo hướng dẫn dưới đây trước khi gửi lên IT Help Desk:
            </span>
          </div>

          <div className="space-y-4">
            {guides.map((guide, idx) => {
              // Kiểm tra hướng dẫn hiện tại đã được người dùng đánh dấu đã thử hay chưa
              const isTried = triedGuides.has(guide.id);

              return (
                <div
                  key={guide.id || idx}
                  className={`rounded-xl border transition-all ${
                    isTried
                      ? "border-emerald-300 bg-emerald-50/30"
                      : "border-brand-bone bg-white hover:border-brand-violet/30"
                  } p-4 shadow-2xs`}
                >
                  {/* Guide Header */}
                  {/* Tiêu đề từng phương án khắc phục, thời gian ước tính và nút đánh dấu đã thử */}
                  <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-brand-violet/10 font-bold text-xs text-brand-violet">
                        {idx + 1}
                      </span>
                      <h3 className="font-bold text-sm text-brand-onyx">
                        {guide.title}
                      </h3>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-brand-slate bg-brand-mist px-2 py-0.5 rounded-md">
                        <Clock className="w-3 h-3 text-brand-ash" />
                        {guide.timeToFix}
                      </span>
                      <button
                        type="button"
                        onClick={() => toggleTried(guide.id)}
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border transition-colors ${
                          isTried
                            ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                            : "bg-white text-brand-slate border-brand-bone hover:bg-brand-mist"
                        }`}
                      >
                        {isTried ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-600" />
                            Đã thử cách này
                          </>
                        ) : (
                          "+ Đánh dấu đã thử"
                        )}
                      </button>
                    </div>
                  </div>

                  <p className="text-xs text-brand-slate mb-3 pl-8">
                    {guide.summary}
                  </p>

                  {/* Steps List */}
                  {/* Danh sách các bước thực hiện chi tiết, kèm khối lệnh mẫu có nút sao chép nhanh nếu có */}
                  <div className="pl-8 space-y-2.5 border-t border-brand-bone/60 pt-3">
                    {guide.steps?.map((step) => (
                      <div key={step.stepNumber} className="text-xs space-y-1">
                        <div className="flex items-start gap-2">
                          <span className="font-semibold text-brand-violet shrink-0">
                            Bước {step.stepNumber}:
                          </span>
                          <span className="text-brand-ink font-medium">
                            {step.title}
                          </span>
                        </div>
                        <p className="text-brand-slate pl-5 leading-relaxed">
                          {step.detail}
                        </p>

                        {/* Hiển thị câu lệnh terminal/cấu hình kèm nút copy vào clipboard */}
                        {step.command && (
                          <div className="pl-5 pt-1">
                            <div className="flex items-center justify-between gap-2 rounded-lg bg-brand-onyx px-3 py-1.5 text-xs text-brand-mist font-mono">
                              <span className="truncate">{step.command}</span>
                              <button
                                type="button"
                                onClick={() => handleCopyCommand(step.command, `${guide.id}-${step.stepNumber}`)}
                                title="Sao chép lệnh"
                                className="inline-flex items-center gap-1 text-[10px] text-brand-slate hover:text-white shrink-0 transition-colors"
                              >
                                {copiedId === `${guide.id}-${step.stepNumber}` ? (
                                  <>
                                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                                    <span>Đã chép</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3.5 h-3.5" />
                                    <span>Sao chép</span>
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer: Confirmation Actions */}
        {/* Chân modal: 2 nút xác nhận kết quả tự kiểm tra và nút quay lại chỉnh sửa biểu mẫu */}
        <div className="p-5 border-t border-brand-bone bg-brand-mist/40 shrink-0 space-y-3">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="text-center sm:text-left">
              <div className="text-xs font-bold text-brand-onyx">
                Sự cố của bạn đã được giải quyết chưa?
              </div>
              <div className="text-[11px] text-brand-slate">
                Nếu đã sửa được, bạn không cần phải chờ đợi IT tiếp nhận xử lý.
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2 shrink-0">
              {/* Option 1: Resolved via Self-Service */}
              {/* Phương án 1: Đã tự sửa thành công -> hủy luồng tạo ticket */}
              <button
                type="button"
                onClick={onSelfResolved}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition-colors shadow-2xs"
              >
                <CheckCircle2 className="w-4 h-4" />
                Đã Sửa Được (Xong)
              </button>

              {/* Option 2: Still not resolved -> Submit to Help Desk */}
              {/* Phương án 2: Vẫn gặp lỗi -> xác nhận gửi ticket chính thức lên IT Help Desk */}
              <button
                type="button"
                disabled={isSubmitting}
                onClick={onConfirmSendToHelpDesk}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand-violet text-white text-xs font-bold hover:bg-purple-700 disabled:opacity-50 transition-colors shadow-2xs"
              >
                <Send className="w-4 h-4" />
                {isSubmitting ? "Đang gửi..." : "Vẫn Không Được, Gửi IT Helpdesk"}
              </button>
            </div>
          </div>

          <div className="text-center">
            <button
              type="button"
              onClick={onClose}
              className="text-xs text-brand-slate hover:text-brand-ink underline"
            >
              Quay lại chỉnh sửa biểu mẫu yêu cầu
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default TroubleshootingConfirmationModal;

