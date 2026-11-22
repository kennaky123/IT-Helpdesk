/**
 * @fileoverview Drawer hiển thị danh sách nhân viên đang được cấp bản quyền phần mềm (Software FinOps).
 *
 * Mục đích & vai trò:
 * - Thuộc phân hệ Software FinOps, mở dạng ngăn kéo trượt bên phải khi người quản trị
 *   xem chi tiết danh sách sử dụng (`DS dùng`) của một gói bản quyền phần mềm.
 * - Hiển thị từng nhân viên đang dùng seat, thông tin thiết bị công ty gắn kèm,
 *   thời gian cấp phát, ghi chú và hỗ trợ thao tác thu hồi seat ngay lập tức.
 *
 * Props:
 * - `licenseId` {string}: ID gói bản quyền cần tải danh sách người dùng.
 * - `onClose` {Function}: Callback đóng drawer.
 * - `onRevoked` {Function}: Callback sau khi thu hồi bản quyền thành công, trả về dữ liệu mới.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Laptop, User, UserMinus, Users, X } from "lucide-react";
import { useEffect, useMemo } from "react";
import { toast } from "react-toastify";
import { getAssets } from "../../services/assetService.js";
import { getSoftwareLicense, revokeLicense } from "../../services/softwareService.js";
import { formatTicketDateTime } from "../../utils/ticketPermissions.js";

/**
 * Component drawer xem và thu hồi seat bản quyền của các nhân viên đang sử dụng.
 */
function AllocatedUsersDrawer({ licenseId, onClose, onRevoked }) {
  const queryClient = useQueryClient();

  // Tải thông tin chi tiết gói bản quyền (bao gồm mảng assignedUsers) theo licenseId
  const licenseQuery = useQuery({
    queryKey: ["software", "detail", licenseId],
    queryFn: ({ signal }) => getSoftwareLicense(licenseId, { signal }),
    enabled: Boolean(licenseId),
  });

  // Tải song song danh sách thiết bị đang ở trạng thái in_use để đối chiếu máy nhân viên đang giữ
  const assetsQuery = useQuery({
    queryKey: ["assets", "list", { status: "in_use" }],
    queryFn: ({ signal }) => getAssets({ status: "in_use" }, { signal }),
  });

  // Hiển thị thông báo lỗi nếu quá trình tải chi tiết bản quyền thất bại
  useEffect(() => {
    if (licenseQuery.error) {
      toast.error("Không thể tải danh sách người dùng được cấp bản quyền.");
    }
  }, [licenseQuery.error]);

  // Xây dựng Map tra cứu nhanh danh sách thiết bị in_use theo ID nhân viên
  const activeDevicesByUserId = useMemo(() => {
    const map = new Map();
    for (const asset of assetsQuery.data?.assets ?? []) {
      const uid = asset.assignedTo?._id;
      if (!uid) continue;
      const list = map.get(uid) ?? [];
      list.push({
        assetTag: asset.assetTag,
        name: asset.name,
        type: asset.type,
      });
      map.set(uid, list);
    }
    return map;
  }, [assetsQuery.data?.assets]);

  // Mutation thực hiện thu hồi bản quyền khỏi nhân viên và cập nhật đồng bộ React Query cache
  const revokeMutation = useMutation({
    mutationFn: ({ userId }) => revokeLicense(licenseId, { userId }),
    onSuccess: (updated, variables) => {
      toast.success(`Đã thu hồi bản quyền từ ${variables.userName}`);
      queryClient.setQueryData(["software", "detail", licenseId], updated);
      queryClient.invalidateQueries({ queryKey: ["software"] });
      onRevoked?.(updated);
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || "Thu hồi bản quyền thất bại.");
    },
  });

  const license = licenseQuery.data;
  const isLoading = licenseQuery.isLoading || assetsQuery.isLoading;

  // Chuẩn hóa danh sách người dùng đã cấp: chỉ giữ lại nhân viên đang thực tế có máy công ty
  const assignedUsers = useMemo(() => {
    const entries = license?.assignedUsers ?? [];
    return entries
      .map((entry) => {
        const userId = entry.user?._id ?? entry.user;
        const activeDevices =
          entry.devices?.length > 0
            ? entry.devices
            : activeDevicesByUserId.get(userId) ?? [];
        return {
          ...entry,
          activeDevices,
        };
      })
      .filter((entry) => entry.activeDevices.length > 0);
  }, [license?.assignedUsers, activeDevicesByUserId]);

  // Xác nhận với người dùng trước khi kích hoạt mutation thu hồi seat
  function handleRevoke(userId, userName) {
    if (
      !window.confirm(
        `Bạn có chắc chắn muốn thu hồi bản quyền của nhân viên "${userName}"?`,
      )
    ) {
      return;
    }
    revokeMutation.mutate({ userId, userName });
  }

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs animate-in fade-in"
    >
      {/* Ngăn kéo trượt từ cạnh phải hiển thị chi tiết người đang dùng seat */}
      <div className="w-full max-w-lg bg-white h-full shadow-2xl flex flex-col border-l border-brand-bone animate-in slide-in-from-right duration-200">
        {/* Header drawer: tên phần mềm và tỷ lệ seat đang dùng */}
        <div className="flex items-center justify-between p-5 border-b border-brand-bone bg-brand-mist/50 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-100 text-brand-violet">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-brand-onyx">
                Nhân Viên Sử Dụng Bản Quyền
              </h2>
              <p className="text-xs text-brand-slate">
                {license
                  ? `${license.name} (${assignedUsers.length}/${license.totalSeats} seats đang dùng)`
                  : "Đang tải..."}
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

        {/* Nội dung danh sách nhân viên hoặc trạng thái đang tải / trống */}
        <div className="p-5 flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-xs text-brand-slate">
              Đang tải danh sách nhân viên...
            </div>
          ) : assignedUsers.length === 0 ? (
            <div className="text-center py-12 px-4 space-y-2">
              <div className="mx-auto w-10 h-10 rounded-full bg-brand-mist flex items-center justify-center text-brand-slate">
                <Users className="w-5 h-5" />
              </div>
              <p className="text-xs font-semibold text-brand-onyx">
                Chưa có nhân viên đang dùng máy công ty được cấp seat
              </p>
              <p className="text-xs text-brand-slate">
                Tất cả {license?.totalSeats || 0} seats hiện đang trống. Nhân viên bị thu hồi máy công ty sẽ tự động bị loại khỏi danh sách này.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="text-xs font-medium text-brand-slate flex justify-between items-center mb-1">
                <span>Đang sử dụng ({assignedUsers.length} nhân viên có máy)</span>
                <span>Thao tác thu hồi</span>
              </div>
              {assignedUsers.map((entry) => {
                // Trích xuất thông tin user và kiểm tra xem bản ghi này có đang trong quá trình thu hồi không
                const user = entry.user || {};
                const userId = user._id ?? entry.user;
                const isCurrentlyRevoking =
                  revokeMutation.isPending &&
                  revokeMutation.variables?.userId === userId;

                return (
                  <div
                    key={userId || entry._id}
                    className="p-3.5 rounded-xl border border-brand-bone bg-white hover:border-purple-200 transition-all shadow-xs"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="w-9 h-9 rounded-full bg-brand-mist flex items-center justify-center text-brand-violet font-semibold text-xs shrink-0 border border-brand-bone">
                          {user.avatarUrl ? (
                            <img
                              src={user.avatarUrl}
                              alt={user.fullName}
                              className="w-full h-full rounded-full object-cover"
                            />
                          ) : (
                            user.fullName?.charAt(0).toUpperCase() || (
                              <User className="w-4 h-4" />
                            )
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-bold text-brand-onyx truncate">
                            {user.fullName || "Nhân viên"}
                          </div>
                          <div className="text-xs text-brand-slate truncate">
                            {user.email || "Không có email"}
                            {user.department ? ` • ${user.department}` : ""}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={isCurrentlyRevoking}
                        onClick={() =>
                          handleRevoke(userId, user.fullName || "Nhân viên")
                        }
                        title="Thu hồi seat bản quyền"
                        className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-red-200 bg-white text-red-600 hover:bg-red-50 text-xs font-semibold transition-colors disabled:opacity-50"
                      >
                        <UserMinus className="w-3.5 h-3.5" />
                        <span>
                          {isCurrentlyRevoking ? "Đang thu hồi..." : "Thu hồi"}
                        </span>
                      </button>
                    </div>

                    <div className="mt-2.5 pt-2.5 border-t border-brand-bone/60 space-y-1.5">
                      {entry.activeDevices.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {entry.activeDevices.map((d) => (
                            <div
                              key={d.assetTag}
                              title={`Đang dùng: ${d.assetTag} • ${d.name}`}
                              className="inline-flex items-center gap-1.5 max-w-full rounded-lg border border-purple-200 bg-purple-50/80 px-2.5 py-1 text-[11px] font-mono font-semibold text-brand-violet"
                            >
                              <Laptop className="w-3.5 h-3.5 shrink-0" />
                              <span className="truncate">
                                Đang dùng: {d.assetTag} • {d.name}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="text-[11px] text-brand-ash font-mono">
                        Cấp ngày: {formatTicketDateTime(entry.assignedAt)}
                      </div>

                      {entry.note && (
                        <div className="text-[11px] text-brand-slate bg-brand-mist/70 rounded-lg px-2.5 py-1.5 border border-brand-bone/80 break-words">
                          {entry.note}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-brand-bone bg-brand-mist/30 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-white border border-brand-bone text-xs font-medium text-brand-slate hover:bg-brand-mist transition-colors"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}

export default AllocatedUsersDrawer;
