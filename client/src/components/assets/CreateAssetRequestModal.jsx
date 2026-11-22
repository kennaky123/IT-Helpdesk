/**
 * Modal tạo yêu cầu cấp phát thiết bị mới gửi cho bộ phận Kỹ thuật viên (Technician) trong module quản lý tài sản (Asset).
 * Tải song song danh sách nhân viên và kỹ thuật viên, cho phép chọn nhân viên nhận, loại thiết bị, kỹ thuật viên phụ trách (tùy chọn) và ghi chú cấu hình.
 *
 * Props:
 * - onClose: Callback đóng modal.
 * - onCreated: Callback(created) được gọi sau khi tạo yêu cầu cấp phát thành công.
 */
import { useEffect, useState } from "react";
import { Laptop, Send, X } from "lucide-react";
import { toast } from "react-toastify";
import { createAssetRequest, getAssignableEmployees } from "../../services/assetService.js";
import { getAdminTechnicians } from "../../services/adminService.js";

/**
 * Component modal tạo yêu cầu xuất kho/cấp phát laptop hoặc thiết bị cho nhân viên.
 */
function CreateAssetRequestModal({ onClose, onCreated }) {
  // Danh sách nhân viên nhận thiết bị và danh sách kỹ thuật viên có thể chỉ định
  const [employees, setEmployees] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  // State lưu giá trị các trường form yêu cầu cấp phát
  const [employeeId, setEmployeeId] = useState("");
  const [technicianId, setTechnicianId] = useState("");
  const [assetType, setAssetType] = useState("laptop");
  const [note, setNote] = useState("");
  // Trạng thái tải danh sách nhân sự ban đầu và trạng thái đang submit form
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Effect tải đồng thời danh sách nhân viên và kỹ thuật viên khi modal mount
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      getAssignableEmployees({ signal: controller.signal }),
      // Nếu lỗi tải danh sách KTV vẫn cho phép tạo yêu cầu ở trạng thái để mở
      getAdminTechnicians({ signal: controller.signal }).catch(() => []),
    ])
      .then(([empList, techList]) => {
        setEmployees(empList);
        setTechnicians(techList);
      })
      .catch((error) => {
        if (error.code !== "ERR_CANCELED") {
          toast.error("Không thể tải danh sách nhân sự.");
        }
      })
      .finally(() => setIsLoading(false));

    return () => controller.abort();
  }, []);

  // Handler kiểm tra chọn nhân viên và gửi API tạo yêu cầu cấp phát thiết bị
  async function handleSubmit(e) {
    e.preventDefault();
    // Validate bắt buộc chọn nhân viên cần cấp thiết bị
    if (!employeeId) {
      toast.warning("Vui lòng chọn nhân viên cần được cấp laptop/thiết bị.");
      return;
    }

    setIsSubmitting(true);
    try {
      const created = await createAssetRequest({
        employeeId,
        technicianId: technicianId || undefined,
        assetType,
        note: note.trim() || undefined,
      });
      toast.success(`Tạo yêu cầu cấp phát ${created.requestCode} thành công!`);
      onCreated?.(created);
    } catch (error) {
      toast.error(error.response?.data?.message || "Tạo yêu cầu cấp phát thất bại.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div
      onClick={(e) => {
        // Chỉ đóng modal khi click ra vùng nền ngoài và không đang gửi API
        if (e.target === e.currentTarget && !isSubmitting) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in"
    >
      <div className="w-full max-w-lg bg-white rounded-2xl border border-brand-bone shadow-2xl overflow-hidden">
        {/* Đầu modal hiển thị tiêu đề và nút đóng */}
        <div className="flex items-center justify-between p-5 border-b border-brand-bone bg-brand-mist/50">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-100 text-brand-violet">
              <Laptop className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-brand-onyx">
                Tạo Yêu Cầu Cấp Phát Laptop
              </h2>
              <p className="text-xs text-brand-slate">
                Gửi yêu cầu cho Kỹ thuật viên (Technician) chuẩn bị và bàn giao máy từ kho
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-brand-slate hover:text-brand-ink hover:bg-brand-mist transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form tạo yêu cầu cấp phát thiết bị */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Chọn nhân viên thụ hưởng */}
          <div>
            <label className="block text-xs font-semibold text-brand-ink mb-1.5">
              Nhân Viên Cần Cấp Thiết Bị <span className="text-red-500">*</span>
            </label>
            {isLoading ? (
              <div className="text-xs text-brand-slate py-2">Đang tải danh sách...</div>
            ) : (
              <select
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                required
                className="w-full px-3 py-2 text-sm rounded-xl border border-brand-bone bg-white focus:outline-none focus:ring-2 focus:ring-brand-violet/20 focus:border-brand-violet"
              >
                <option value="">-- Chọn nhân viên cần cấp máy --</option>
                {employees.map((emp) => (
                  <option key={emp._id} value={emp._id}>
                    {emp.fullName} ({emp.email}) - {emp.department || "Nhân viên"}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Chọn loại thiết bị và kỹ thuật viên phụ trách (tùy chọn) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-brand-ink mb-1.5">
                Loại Thiết Bị
              </label>
              <select
                value={assetType}
                onChange={(e) => setAssetType(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-xl border border-brand-bone bg-white focus:outline-none focus:ring-2 focus:ring-brand-violet/20 focus:border-brand-violet"
              >
                <option value="laptop">Laptop (Máy tính xách tay)</option>
                <option value="desktop">Desktop / PC để bàn</option>
                <option value="monitor">Màn hình hiển thị</option>
                <option value="accessory">Phụ kiện công nghệ</option>
                <option value="other">Thiết bị khác</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-brand-ink mb-1.5">
                Chỉ Định Kỹ Thuật Viên
              </label>
              <select
                value={technicianId}
                onChange={(e) => setTechnicianId(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-xl border border-brand-bone bg-white focus:outline-none focus:ring-2 focus:ring-brand-violet/20 focus:border-brand-violet"
              >
                <option value="">-- Để mở (KTV tự tiếp nhận) --</option>
                {technicians.map((tech) => (
                  <option key={tech.id} value={tech.id}>
                    {tech.name} ({tech.specialization || "KTV"})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Ghi chú nhu cầu cấu hình hoặc phần mềm cần cài sẵn */}
          <div>
            <label className="block text-xs font-semibold text-brand-ink mb-1">
              Ghi Chú Nhu Cầu / Cấu Hình Yêu Cầu
            </label>
            <textarea
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ví dụ: Nhân viên mới phòng Thiết kế Đồ họa, cần laptop ThinkPad hoặc Dell Core i7 32GB RAM để cài Photoshop/Figma..."
              className="w-full px-3 py-2 text-sm rounded-xl border border-brand-bone bg-white focus:outline-none focus:ring-2 focus:ring-brand-violet/20 focus:border-brand-violet"
            />
          </div>

          {/* Hàng nút Hủy và Gửi yêu cầu */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-brand-bone">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-brand-bone text-xs font-semibold text-brand-slate hover:bg-brand-mist transition-colors"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !employeeId}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand-violet text-white text-xs font-bold hover:bg-purple-700 disabled:opacity-50 transition-colors shadow-xs"
            >
              <Send className="w-3.5 h-3.5" />
              {isSubmitting ? "Đang gửi..." : "Gửi Yêu Cầu Cho Technician"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CreateAssetRequestModal;

