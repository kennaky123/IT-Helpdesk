import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Laptop, ShieldCheck, Users, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "react-toastify";
import { getAssets } from "../../services/assetService.js";
import { allocateLicense } from "../../services/softwareService.js";
import { Badge } from "../ui/badge.jsx";

function AllocateLicenseModal({ license, onClose, onAllocated }) {
  const queryClient = useQueryClient();
  const [selectedUserId, setSelectedUserId] = useState("");
  const [note, setNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: inUseAssetData, isLoading: isLoadingEmployees } = useQuery({
    queryKey: ["assets", "list", { status: "in_use" }],
    queryFn: ({ signal }) => getAssets({ status: "in_use" }, { signal }),
  });

  const activeMachineEmployees = useMemo(() => {
    const byUser = new Map();
    for (const asset of inUseAssetData?.assets ?? []) {
      const emp = asset.assignedTo;
      if (!emp?._id) continue;
      const entry = byUser.get(emp._id) ?? {
        ...emp,
        devices: [],
      };
      entry.devices.push({
        _id: asset._id,
        assetTag: asset.assetTag,
        name: asset.name,
        type: asset.type,
      });
      byUser.set(emp._id, entry);
    }
    return Array.from(byUser.values()).sort((a, b) =>
      (a.fullName || "").localeCompare(b.fullName || "", "vi"),
    );
  }, [inUseAssetData?.assets]);

  const assignedUserIds = new Set(
    (license?.assignedUsers || []).map((entry) =>
      typeof entry.user === "object" ? entry.user?._id : entry.user,
    ),
  );

  const availableEmployees = activeMachineEmployees.filter(
    (emp) => !assignedUserIds.has(emp._id),
  );

  async function handleSubmit(e) {
    e.preventDefault();
    if (!selectedUserId) {
      toast.warning("Vui lòng chọn nhân viên đang sử dụng máy công ty.");
      return;
    }

    setIsSubmitting(true);
    try {
      const updated = await allocateLicense(license._id, {
        userId: selectedUserId,
        note: note.trim() || undefined,
      });
      queryClient.invalidateQueries({ queryKey: ["software"] });
      toast.success(`Đã cấp phát bản quyền ${license.name} thành công!`);
      onAllocated?.(updated);
      onClose();
    } catch (error) {
      toast.error(error.response?.data?.message || "Cấp phát bản quyền thất bại.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const remainingSeats =
    license.availableSeats !== undefined
      ? license.availableSeats
      : Math.max(0, (license.totalSeats || 0) - assignedUserIds.size);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in">
      <div className="w-full max-w-xl bg-white rounded-2xl border border-brand-bone shadow-xl overflow-hidden max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-brand-bone bg-brand-mist/50 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-100 text-brand-violet">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-brand-onyx">
                Cấp Phát Bản Quyền Phần Mềm
              </h2>
              <p className="text-xs text-brand-slate">
                Hiển thị nhân viên đang sử dụng máy công ty (tự loại khi thu hồi máy)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-brand-slate hover:text-brand-ink hover:bg-brand-mist transition-colors"
            aria-label="Đóng"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto">
          {/* Software Info Card */}
          <div className="rounded-xl border border-brand-bone bg-brand-mist/60 p-3.5 space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-brand-slate">Phần mềm & Nhà cung cấp:</span>
              <span className="font-semibold text-brand-onyx">
                {license.name} ({license.vendor})
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-brand-slate">Phân loại & Hình thức:</span>
              <span className="text-brand-slate">{license.category}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-brand-slate">Số lượng seat còn trống:</span>
              <span className="inline-flex items-center gap-1 font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                <Users className="w-3.5 h-3.5" />
                {remainingSeats} / {license.totalSeats} seats trống
              </span>
            </div>
          </div>

          {/* All employees currently using company computers */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-brand-onyx flex items-center gap-1.5">
                <Laptop className="w-3.5 h-3.5 text-brand-violet" />
                Nhân viên đang sử dụng máy công ty ({activeMachineEmployees.length})
              </span>
              <span className="text-[11px] text-brand-ash">
                Thu hồi máy sẽ tự động xóa khỏi danh sách
              </span>
            </div>

            {isLoadingEmployees ? (
              <div className="h-12 flex items-center justify-center bg-brand-mist/40 rounded-xl text-xs text-brand-slate border border-brand-bone">
                Đang đồng bộ danh sách máy đang sử dụng...
              </div>
            ) : activeMachineEmployees.length === 0 ? (
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-800">
                Hiện chưa có nhân viên nào đang giữ máy của công ty (hoặc tất cả máy đã bị thu hồi).
              </div>
            ) : (
              <div className="max-h-44 overflow-y-auto divide-y divide-brand-bone rounded-xl border border-brand-bone bg-white">
                {activeMachineEmployees.map((emp) => {
                  const isAssigned = assignedUserIds.has(emp._id);
                  const isSelected = selectedUserId === emp._id;
                  return (
                    <div
                      key={emp._id}
                      className={`flex items-center justify-between gap-2 px-3 py-2 text-xs transition-colors ${
                        isSelected ? "bg-purple-50/80" : "hover:bg-brand-mist/40"
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="font-semibold text-brand-ink truncate">
                          {emp.fullName}{" "}
                          <span className="font-normal text-brand-ash">
                            ({emp.department || "Nhân viên"})
                          </span>
                        </div>
                        <div className="text-[11px] font-mono text-brand-slate truncate">
                          {emp.devices
                            .map((d) => `${d.assetTag} • ${d.name}`)
                            .join(", ")}
                        </div>
                      </div>
                      {isAssigned ? (
                        <Badge variant="emerald" className="shrink-0 text-[10px]">
                          Đã cấp bản quyền
                        </Badge>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setSelectedUserId(emp._id)}
                          className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold border transition ${
                            isSelected
                              ? "border-brand-violet bg-brand-violet text-white"
                              : "border-purple-200 bg-purple-50 text-brand-violet hover:bg-purple-100"
                          }`}
                        >
                          {isSelected ? "Đang chọn" : "Chọn cấp"}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-brand-onyx mb-1">
              Chọn nhân viên tiếp nhận bản quyền <span className="text-red-500">*</span>
            </label>
            {isLoadingEmployees ? (
              <div className="h-10 flex items-center justify-center bg-brand-mist/40 rounded-xl text-xs text-brand-slate border border-brand-bone">
                Đang tải danh sách nhân viên...
              </div>
            ) : availableEmployees.length === 0 ? (
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-700">
                Tất cả nhân viên đang sử dụng máy công ty đều đã được cấp bản quyền này hoặc chưa có máy nào đang cấp phát.
              </div>
            ) : (
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                required
                className="w-full text-xs rounded-xl border border-brand-bone px-3 py-2.5 bg-white text-brand-onyx focus:ring-2 focus:ring-brand-violet/20 focus:border-brand-violet outline-hidden"
              >
                <option value="">-- Chọn nhân viên đang dùng máy công ty --</option>
                {availableEmployees.map((emp) => (
                  <option key={emp._id} value={emp._id}>
                    {emp.fullName} ({emp.email}) — Đang dùng:{" "}
                    {emp.devices.map((d) => d.assetTag).join(", ")}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-brand-onyx mb-1">
              Ghi chú cấp phát (tùy chọn)
            </label>
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="VD: Phục vụ công việc trên máy công ty được cấp..."
              className="w-full text-xs rounded-xl border border-brand-bone p-3 bg-white text-brand-onyx focus:ring-2 focus:ring-brand-violet/20 focus:border-brand-violet outline-hidden resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-brand-bone">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl border border-brand-bone text-xs font-medium text-brand-slate hover:bg-brand-mist transition-colors"
            >
              Hủy bỏ
            </button>
            <button
              type="submit"
              disabled={isSubmitting || isLoadingEmployees || availableEmployees.length === 0}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand-violet text-white text-xs font-semibold hover:bg-purple-700 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              <Check className="w-4 h-4" />
              {isSubmitting ? "Đang xử lý..." : "Xác nhận cấp phát"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default AllocateLicenseModal;
