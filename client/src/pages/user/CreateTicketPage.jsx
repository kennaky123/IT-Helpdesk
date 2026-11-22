/**
 * @file CreateTicketPage.jsx
 * @description Trang Tạo Ticket Yêu Cầu Hỗ Trợ Mới trên Cổng dịch vụ CNTT.
 * @role User (Nhân viên nội bộ).
 * @flow Hiển thị bố cục 2 cột: cột chính bên trái là `TicketRequestForm` (nhập tiêu đề, danh mục, tự phục vụ KB, đính kèm ảnh, gửi yêu cầu) và cột phụ bên phải là lưu ý gửi lỗi + bảng cam kết SLA.
 */
import { CheckCircle2, Clock3, Image, ShieldCheck, Sparkles } from "lucide-react";
import TicketRequestForm from "../../components/ticket/create/TicketRequestForm.jsx";

// Danh sách các lưu ý quan trọng giúp người dùng mô tả sự cố đầy đủ và an toàn bảo mật trước khi gửi ticket
const SUPPORT_TIPS = [
  {
    icon: CheckCircle2,
    title: "Mô tả đúng sự cố",
    description: "Nêu rõ thiết bị, phần mềm và thông báo lỗi nếu có.",
  },
  {
    icon: Image,
    title: "Đính kèm ảnh chụp màn hình",
    description:
      "Ảnh chụp lỗi giúp kỹ thuật viên xác định nguyên nhân nhanh hơn.",
  },
  {
    icon: ShieldCheck,
    title: "Không gửi dữ liệu nhạy cảm",
    description:
      "Che mật khẩu, mã OTP và thông tin riêng tư trước khi tải ảnh.",
  },
];

/**
 * Component trang tạo ticket mới cho người dùng.
 * Kết hợp form gửi ticket (`TicketRequestForm`) với thanh hướng dẫn quy chuẩn mô tả và cam kết thời gian xử lý SLA.
 */
function CreateTicketPage() {
  return (
    <section aria-labelledby="create-ticket-title">
      <div className="mb-6">
        <p className="text-[11px] font-bold tracking-wider text-brand-violet uppercase">
          Cổng dịch vụ CNTT — DeskPro IT
        </p>
        <h1
          id="create-ticket-title"
          className="mt-1 font-display text-2xl font-extrabold tracking-tight text-brand-ink sm:text-3xl"
        >
          Tạo Ticket Yêu Cầu Hỗ Trợ Mới
        </h1>
        <p className="mt-1.5 max-w-2xl text-xs leading-5 text-brand-slate sm:text-sm">
          Hệ thống sẽ tự động phân tuyến đến kỹ thuật viên phù hợp và kích hoạt
          cam kết SLA ngay sau khi gửi.
        </p>
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        {/* Cột trái: Form nhập yêu cầu hỗ trợ (chọn danh mục, gợi ý KB tự phục vụ, mô tả, ảnh đính kèm) */}
        <TicketRequestForm />

        {/* Cột phải: Thanh lưu ý trước khi gửi, cam kết SLA và hướng dẫn trợ lý tự phục vụ */}
        <aside
          className="space-y-4 xl:sticky xl:top-20"
          aria-label="Hướng dẫn tạo yêu cầu"
        >
          <div className="rounded-xl border border-brand-bone bg-white p-5 shadow-xs">
            <div className="flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-xl bg-brand-violet/10 text-brand-violet">
                <Clock3 className="size-4.5" aria-hidden="true" />
              </span>
              <div>
                <h2 className="font-display text-sm font-bold text-brand-ink">
                  Lưu ý trước khi gửi
                </h2>
                <p className="text-xs text-brand-slate">
                  Giúp yêu cầu được xử lý nhanh hơn
                </p>
              </div>
            </div>

            <ul className="mt-4 space-y-4">
              {SUPPORT_TIPS.map((tip) => {
                const Icon = tip.icon;

                return (
                  <li key={tip.title} className="flex items-start gap-2.5">
                    <Icon
                      className="mt-0.5 size-4 shrink-0 text-brand-violet"
                      aria-hidden="true"
                    />
                    <div>
                      <p className="text-xs font-bold text-brand-ink">
                        {tip.title}
                      </p>
                      <p className="mt-0.5 text-xs leading-5 text-brand-slate">
                        {tip.description}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="rounded-xl border border-brand-violet/20 bg-brand-violet/5 p-5 text-xs text-brand-ink">
            <p className="font-display font-bold text-brand-violet">
              Cam kết SLA theo mức độ ưu tiên
            </p>
            <ul className="mt-2 space-y-1.5 text-brand-slate">
              <li>
                • <strong className="text-red-600">P1 - Khẩn cấp:</strong> Phản
                hồi &lt; 15 phút, xử lý &lt; 2 giờ
              </li>
              <li>
                • <strong className="text-orange-600">P2 - Cao:</strong> Phản
                hồi &lt; 30 phút, xử lý &lt; 4 giờ
              </li>
              <li>
                • <strong className="text-brand-blue">P3 - Vừa:</strong> Xử lý
                trong 8 giờ làm việc
              </li>
            </ul>
          </div>

          <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-5 text-xs text-emerald-950">
            <div className="flex items-center gap-2 font-display font-bold text-emerald-800">
              <Sparkles className="size-4 text-emerald-600" />
              Trợ lý khắc phục tự phục vụ
            </div>
            <p className="mt-2 text-emerald-900 leading-relaxed">
              Hệ thống sẽ gửi các cách sửa lỗi thông dụng tương ứng theo danh mục bạn chọn trước. Nếu đã sửa xong, bạn không cần chờ đợi IT. Nếu vẫn chưa được, bạn chỉ cần 1 click xác nhận là lỗi mới để chuyển ticket lên Help Desk.
            </p>
          </div>
        </aside>
      </div>
    </section>
  );
}

export default CreateTicketPage;
