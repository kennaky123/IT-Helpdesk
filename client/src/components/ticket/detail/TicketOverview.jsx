import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Monitor, Sparkles } from "lucide-react";
import { toast } from "react-toastify";
import { formatTicketDateTime } from "../../../utils/ticketPermissions.js";
import { getAssets, launchRemoteDesktop } from "../../../services/assetService.js";
import RemoteConnectModal from "../../assets/RemoteConnectModal.jsx";
import { Button } from "../../ui/button.jsx";

function getInitials(name = "") {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "NV";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function TicketMetadataCard({ ticket }) {
  const queryClient = useQueryClient();
  const [isRemoteModalOpen, setIsRemoteModalOpen] = useState(false);
  const creatorId = ticket.createdBy?._id;

  const { data: assetData, isLoading: isAssetLoading } = useQuery({
    queryKey: ["assets", "byUser", creatorId],
    queryFn: ({ signal }) => getAssets({ assignedTo: creatorId }, { signal }),
    enabled: Boolean(creatorId),
  });

  const realAsset = assetData?.assets?.[0] ?? null;

  const requesterName = ticket.createdBy?.fullName ?? "Không xác định";
  const requesterDept =
    ticket.createdBy?.department || "Chưa cập nhật phòng ban";
  const requesterEmail = ticket.createdBy?.email || "Chưa cập nhật";

  async function handleRemoteClick() {
    if (!realAsset) return;
    if (realAsset.remoteId) {
      try {
        const { appName, id } = await launchRemoteDesktop(
          realAsset.remoteTool,
          realAsset.remoteId,
        );
        toast.success(
          `Đã sao chép ${appName} ID (${id}) và mở kết nối tới thiết bị của ${requesterName}!`,
        );
      } catch (err) {
        toast.error(err.message || "Không thể mở ứng dụng điều khiển từ xa.");
      }
    } else {
      setIsRemoteModalOpen(true);
    }
  }

  return (
    <div className="divide-y divide-brand-bone">
      {/* Section: Requester Info */}
      <section className="p-5">
        <h3 className="mb-3 text-[11px] font-bold tracking-wider text-brand-slate uppercase">
          Thông Tin Người Yêu Cầu
        </h3>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-violet/10 font-bold text-brand-violet">
            {getInitials(requesterName)}
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-bold text-brand-ink">
              {requesterName}
            </div>
            <div className="truncate text-xs text-brand-slate">
              {requesterDept}
            </div>
          </div>
        </div>
        <div className="mt-3 space-y-1.5 text-xs text-brand-slate">
          <div className="flex justify-between gap-2">
            <span className="text-brand-ash">Email:</span>
            <span className="truncate font-mono font-medium text-brand-ink">
              {requesterEmail}
            </span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-brand-ash">Danh mục:</span>
            <span className="font-semibold text-brand-ink">
              {ticket.category?.name ?? "Không xác định"}
            </span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-brand-ash">Kỹ thuật viên:</span>
            <span className="font-semibold text-brand-ink">
              {ticket.assignedTo?.fullName ?? "Chưa phân công"}
            </span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-brand-ash">Ngày tạo:</span>
            <time
              dateTime={ticket.createdAt}
              className="font-mono font-medium text-brand-ink"
            >
              {formatTicketDateTime(ticket.createdAt)}
            </time>
          </div>
          {ticket.assignedAt ? (
            <div className="flex justify-between gap-2">
              <span className="text-brand-ash">Phân công lúc:</span>
              <time
                dateTime={ticket.assignedAt}
                className="font-mono font-medium text-brand-ink"
              >
                {formatTicketDateTime(ticket.assignedAt)}
              </time>
            </div>
          ) : null}
        </div>
      </section>

      {/* Section: Asset CMDB */}
      <section className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[11px] font-bold tracking-wider text-brand-slate uppercase">
            Thiết Bị Cấp Phát (Asset)
          </h3>
          {realAsset ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-emerald">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-emerald" />
              Đã ghi nhận
            </span>
          ) : null}
        </div>

        {isAssetLoading ? (
          <div className="rounded-xl border border-brand-bone bg-brand-mist/60 p-3.5 text-xs text-brand-slate">
            Đang tra cứu thiết bị từ CMDB...
          </div>
        ) : realAsset ? (
          <>
            <div className="space-y-2.5 rounded-xl border border-brand-bone bg-brand-mist/60 p-3.5 text-xs">
              <div className="flex justify-between gap-2">
                <span className="text-brand-slate">Thiết bị:</span>
                <span className="text-right font-semibold text-brand-ink">
                  {realAsset.name}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-brand-slate">Asset Tag:</span>
                <span className="rounded border border-brand-bone bg-white px-1.5 py-0.5 font-mono font-bold text-brand-violet">
                  {realAsset.assetTag}
                </span>
              </div>
              {realAsset.os ? (
                <div className="flex justify-between gap-2">
                  <span className="text-brand-slate">Hệ điều hành:</span>
                  <span className="text-right font-medium text-brand-ink">
                    {realAsset.os}
                  </span>
                </div>
              ) : null}
              {realAsset.specs ? (
                <div className="flex justify-between gap-2">
                  <span className="text-brand-slate">Cấu hình:</span>
                  <span className="max-w-[180px] truncate text-right font-medium text-brand-slate">
                    {realAsset.specs}
                  </span>
                </div>
              ) : null}
              {realAsset.remoteId ? (
                <div className="flex justify-between gap-2">
                  <span className="text-brand-slate">
                    Remote ID ({realAsset.remoteTool}):
                  </span>
                  <span className="font-mono font-bold text-brand-violet">
                    {realAsset.remoteId}
                  </span>
                </div>
              ) : null}
              <div className="flex justify-between gap-2 border-t border-brand-bone pt-2">
                <span className="text-brand-slate">Trạng thái:</span>
                <span className="font-semibold text-brand-emerald">
                  Đang Cấp Phát (Chính Chủ)
                </span>
              </div>
            </div>

            <div className="mt-3 flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleRemoteClick}
                className="flex-1 border-brand-violet/30 bg-purple-50/60 text-brand-violet hover:bg-purple-100"
              >
                <Monitor className="h-3.5 w-3.5" />
                {realAsset.remoteId ? "Remote Support" : "Cấu hình Remote ID"}
              </Button>
            </div>
          </>
        ) : (
          <div className="rounded-xl border border-dashed border-brand-bone bg-brand-mist/40 p-3.5 text-xs text-brand-slate">
            Người dùng này chưa được gán thiết bị nào trong kho tài sản CMDB.
          </div>
        )}

        {isRemoteModalOpen && realAsset ? (
          <RemoteConnectModal
            asset={realAsset}
            onClose={() => setIsRemoteModalOpen(false)}
            onUpdated={() => {
              queryClient.invalidateQueries({ queryKey: ["assets"] });
              setIsRemoteModalOpen(false);
            }}
          />
        ) : null}
      </section>
    </div>
  );
}

function TicketDescriptionCard({ ticket }) {
  const requesterName = ticket.createdBy?.fullName ?? "Người yêu cầu";

  return (
    <section className="rounded-xl border border-brand-bone bg-white p-5 shadow-2xs">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-ink text-xs font-bold text-white">
            {getInitials(requesterName)}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-bold text-brand-ink">
                {requesterName}
              </span>
              <span className="rounded bg-brand-mist px-2 py-0.5 text-[11px] font-medium text-brand-slate">
                Người yêu cầu • Mô tả sự cố gốc
              </span>
            </div>
            <div className="text-[11px] text-brand-ash">
              Gửi qua Cổng Self-Service DeskPro IT
            </div>
          </div>
        </div>
        <time
          dateTime={ticket.createdAt}
          className="font-mono text-xs text-brand-ash"
        >
          {formatTicketDateTime(ticket.createdAt)}
        </time>
      </div>

      {ticket.description?.includes("[Đã tự thử kiểm tra theo hướng dẫn danh mục") ? (
        <div className="mb-3 ml-10 inline-flex items-center gap-1.5 rounded-full border border-purple-200 bg-purple-50 px-3 py-1 text-xs font-semibold text-brand-violet">
          <Sparkles className="size-3.5" />
          Đã tự thử khắc phục theo danh mục trước khi gửi (Xác nhận lỗi mới)
        </div>
      ) : null}

      <p className="pl-10 text-sm leading-relaxed whitespace-pre-wrap wrap-break-word text-brand-ink">
        {ticket.description}
      </p>

      {ticket.resolution ? (
        <div className="mt-5 ml-10 rounded-xl border border-brand-emerald/30 bg-emerald-50/70 p-4">
          <h3 className="text-xs font-bold tracking-wider text-emerald-900 uppercase">
            Giải Pháp Khắc Phục Chính Thức (Resolution)
          </h3>
          <p className="mt-1.5 text-sm leading-relaxed whitespace-pre-wrap wrap-break-word text-emerald-950">
            {ticket.resolution}
          </p>
          {ticket.resolvedAt ? (
            <p className="mt-2 font-mono text-xs text-emerald-700">
              Hoàn thành lúc {formatTicketDateTime(ticket.resolvedAt)}
            </p>
          ) : null}
        </div>
      ) : null}

      {ticket.status === "cancelled" ? (
        <div className="mt-5 ml-10 rounded-xl border border-red-200 bg-red-50 p-4">
          <h3 className="text-xs font-bold tracking-wider text-red-900 uppercase">
            Ticket Đã Bị Hủy
          </h3>
          <p className="mt-1.5 text-sm leading-relaxed whitespace-pre-wrap wrap-break-word text-red-800">
            {ticket.cancellationReason || "Không có lý do hủy."}
          </p>
          {ticket.cancelledAt ? (
            <p className="mt-2 font-mono text-xs text-red-700">
              Hủy lúc {formatTicketDateTime(ticket.cancelledAt)}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export { TicketDescriptionCard, TicketMetadataCard };
