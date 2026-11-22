/**
 * TicketRequestForm.jsx
 *
 * Chức năng: Biểu mẫu tạo mới yêu cầu hỗ trợ IT (ticket) với đầy đủ tính năng nhập liệu,
 * kiểm tra hợp lệ qua Zod, đính kèm/xem trước ảnh, gợi ý tự khắc phục theo danh mục và theo dõi tiến độ upload.
 * Props: Không nhận props (tự tải danh mục, kỹ thuật viên qua hook và điều hướng sau khi tạo xong).
 * Vai trò: Thành phần trung tâm của luồng tạo mới ticket; trước khi gọi API tạo ticket,
 * nếu phát hiện hướng dẫn khắc phục phù hợp sẽ bật `TroubleshootingConfirmationModal` để người dùng tự kiểm tra trước.
 */
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, LoaderCircle, RefreshCw, Send, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { clientEnv } from "../../../config/env.js";
import useActiveCategories from "../../../hooks/useActiveCategories.js";
import useActiveTechnicians from "../../../hooks/useActiveTechnicians.js";
import { getCategoryErrorMessage } from "../../../services/categoryService.js";
import {
  createTicket,
  getCreateTicketError,
} from "../../../services/ticketService.js";
import {
  PRIORITY_OPTIONS,
  ticketRequestSchema,
  validateImageFile,
} from "../../../utils/ticketFormValidation.js";
import ImageAttachmentField from "./ImageAttachmentField.jsx";
import { getTroubleshootingGuidesForTicket } from "../../../data/troubleshootingGuides.js";
import TroubleshootingConfirmationModal from "./TroubleshootingConfirmationModal.jsx";

// Giá trị mặc định khởi tạo cho các trường trong form tạo ticket (đóng băng để tránh sửa nhầm)
const INITIAL_VALUES = Object.freeze({
  title: "",
  category: "",
  priority: "medium",
  technicianId: "",
  description: "",
});

// Class CSS chuẩn dùng chung cho các ô input, select và textarea của biểu mẫu
const inputClassName =
  "mt-1.5 w-full rounded-xl border border-brand-bone bg-brand-mist px-3.5 py-2.5 text-sm text-brand-ink outline-none transition placeholder:text-brand-ash focus:border-brand-violet focus:bg-white focus:ring-2 focus:ring-brand-violet/20 disabled:cursor-not-allowed disabled:opacity-60";

// Helper tạo chữ ký nhận diện tệp ảnh theo tên, dung lượng và thời điểm sửa đổi để chặn chọn trùng
function getFileSignature(file) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

// Helper sinh mã định danh duy nhất cho từng ảnh đính kèm để dùng làm key trong danh sách preview
function createAttachmentId() {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `attachment-${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
}

// Sub-component hiển thị dấu sao đỏ đánh dấu trường bắt buộc nhập kèm văn bản ẩn cho screen reader
function RequiredMark() {
  return (
    <>
      <span className="ml-1 text-red-500" aria-hidden="true">
        *
      </span>
      <span className="sr-only"> (bắt buộc)</span>
    </>
  );
}

// Component biểu mẫu tạo yêu cầu hỗ trợ IT chính
function TicketRequestForm() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  // Tải danh sách danh mục đang hoạt động cho dropdown chọn loại sự cố
  const {
    categories,
    error: categoryError,
    isLoading,
    refetch,
  } = useActiveCategories();
  // Tải danh sách kỹ thuật viên đang hoạt động để người dùng có thể chỉ định trước (tùy chọn)
  const {
    technicians,
    isLoading: techniciansLoading,
  } = useActiveTechnicians(true);
  // State quản lý lỗi ảnh đính kèm, danh sách ảnh preview, lỗi API và trạng thái đang gửi/upload
  const [attachmentError, setAttachmentError] = useState("");
  const [attachments, setAttachments] = useState([]);
  const [apiError, setApiError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);
  // State bật/tắt modal hướng dẫn tự kiểm tra khắc phục trước khi gửi ticket
  const [showTroubleshootModal, setShowTroubleshootModal] = useState(false);
  // Refs hỗ trợ focus vào khối lỗi API, hủy request đang chạy và quản lý tập Blob URL cần thu hồi
  const apiErrorRef = useRef(null);
  const requestControllerRef = useRef(null);
  const previewUrlsRef = useRef(new Set());

  // Khởi tạo React Hook Form kết hợp Zod schema; validate khi trường đã được chạm (onTouched)
  const {
    register,
    control,
    handleSubmit,
    setError,
    getValues,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(ticketRequestSchema),
    defaultValues: INITIAL_VALUES,
    mode: "onTouched",
  });

  // Theo dõi giá trị các trường theo thời gian thực để đếm ký tự, hiển thị mô tả priority và tìm hướng dẫn gợi ý
  const watchedTitle = useWatch({ control, name: "title", defaultValue: "" });
  const watchedCategory = useWatch({
    control,
    name: "category",
    defaultValue: "",
  });
  const watchedPriority = useWatch({
    control,
    name: "priority",
    defaultValue: "medium",
  });
  const watchedDescription = useWatch({
    control,
    name: "description",
    defaultValue: "",
  });

  // Tìm đối tượng danh mục đầy đủ tương ứng với ID danh mục đang chọn
  const selectedCategoryObj = useMemo(() => {
    return (
      categories.find((category) => category.id === watchedCategory) || null
    );
  }, [categories, watchedCategory]);

  // Lọc và xếp hạng các hướng dẫn tự khắc phục phù hợp dựa theo danh mục, tiêu đề và mô tả sự cố
  const relevantGuides = useMemo(() => {
    if (!selectedCategoryObj) return [];
    return getTroubleshootingGuidesForTicket({
      category: selectedCategoryObj,
      title: watchedTitle,
      description: watchedDescription,
    });
  }, [selectedCategoryObj, watchedTitle, watchedDescription]);

  // Effect dọn dẹp khi component bị hủy: abort request gửi ticket đang chạy và giải phóng toàn bộ Blob URL preview
  useEffect(() => {
    const previewUrls = previewUrlsRef.current;

    return () => {
      requestControllerRef.current?.abort();
      previewUrls.forEach((previewUrl) => URL.revokeObjectURL(previewUrl));
      previewUrls.clear();
    };
  }, []);

  // Handler xử lý danh sách file ảnh người dùng vừa chọn/thả: kiểm tra định dạng, dung lượng, trùng lặp và giới hạn số lượng
  function handleFilesSelected(files) {
    if (files.length === 0) {
      return;
    }

    const currentSignatures = new Set(
      attachments.map(({ file }) => getFileSignature(file)),
    );
    const availableSlots = Math.max(
      0,
      clientEnv.maxFilesPerTicket - attachments.length,
    );
    const acceptedAttachments = [];
    const rejectedMessages = [];

    files.forEach((file) => {
      // Kiểm tra định dạng MIME (JPEG/PNG/WebP), file rỗng và giới hạn dung lượng (MB)
      const validationMessage = validateImageFile(
        file,
        clientEnv.maxFileSizeMb,
      );
      const signature = getFileSignature(file);

      if (validationMessage) {
        rejectedMessages.push(validationMessage);
        return;
      }

      // Chặn thêm trùng ảnh đã có trong danh sách đính kèm hiện tại
      if (currentSignatures.has(signature)) {
        rejectedMessages.push(`${file.name}: ảnh này đã được chọn.`);
        return;
      }

      // Chặn thêm nếu vượt quá số lượng ảnh tối đa mỗi ticket
      if (acceptedAttachments.length >= availableSlots) {
        if (!rejectedMessages.some((message) => message.includes("tối đa"))) {
          rejectedMessages.push(
            `Mỗi yêu cầu chỉ được đính kèm tối đa ${clientEnv.maxFilesPerTicket} ảnh.`,
          );
        }
        return;
      }

      // Tạo Blob URL tạm để hiển thị ảnh xem trước và lưu vào ref để chủ động thu hồi sau
      const previewUrl = URL.createObjectURL(file);
      previewUrlsRef.current.add(previewUrl);
      currentSignatures.add(signature);
      acceptedAttachments.push({
        id: createAttachmentId(),
        file,
        previewUrl,
      });
    });

    if (acceptedAttachments.length > 0) {
      setAttachments((currentAttachments) => [
        ...currentAttachments,
        ...acceptedAttachments,
      ]);
    }

    setAttachmentError(rejectedMessages.join(" "));
    setApiError(null);
  }

  // Handler xóa một ảnh khỏi danh sách đính kèm và giải phóng ngay Blob URL xem trước của ảnh đó
  function handleRemoveAttachment(attachmentId) {
    setAttachments((currentAttachments) => {
      const attachment = currentAttachments.find(
        (item) => item.id === attachmentId,
      );

      if (attachment) {
        URL.revokeObjectURL(attachment.previewUrl);
        previewUrlsRef.current.delete(attachment.previewUrl);
      }

      return currentAttachments.filter((item) => item.id !== attachmentId);
    });
    setAttachmentError("");
  }

  // Handler sau khi form vượt qua validation của Zod: kiểm tra danh mục hợp lệ và quyết định mở modal tự kiểm tra hay gửi ngay
  function onValidSubmit(formData) {
    if (isSubmitting) {
      return;
    }

    setApiError(null);

    // Đảm bảo danh mục người dùng chọn vẫn còn nằm trong danh sách danh mục đang hoạt động
    if (
      formData.category &&
      !categories.some((category) => category.id === formData.category)
    ) {
      setError("category", {
        type: "manual",
        message: "Danh mục đã chọn không còn hoạt động.",
      });
      return;
    }

    // Nếu có hướng dẫn sửa lỗi thông dụng theo danh mục, hiển thị modal trợ lý trước để người dùng thử xử lý
    if (relevantGuides.length > 0) {
      setShowTroubleshootModal(true);
      return;
    }

    // Nếu không có hướng dẫn thì gửi trực tiếp
    executeSubmitTicket({ formData });
  }

  // Thực thi gọi API tạo ticket kèm ảnh đính kèm, theo dõi phần trăm upload và xử lý phản hồi/lỗi
  async function executeSubmitTicket({ confirmedNewIssue = false, formData } = {}) {
    const payload = formData ?? getValues();
    // Tạo AbortController riêng cho request hiện tại để hủy sạch nếu người dùng rời trang giữa chừng
    const abortController = new AbortController();
    requestControllerRef.current = abortController;
    setIsSubmitting(true);
    setUploadProgress(null);

    // Nếu người dùng đã thử khắc phục theo danh mục nhưng chưa hết lỗi, gắn thêm ghi chú rõ ràng
    const finalDescription = confirmedNewIssue
      ? `[Đã tự thử kiểm tra theo hướng dẫn danh mục "${selectedCategoryObj?.name || ""}" nhưng chưa hết lỗi]\n\n${payload.description}`
      : payload.description;

    try {
      // Gọi service tạo ticket dạng multipart/form-data và cập nhật phần trăm tiến độ tải ảnh
      const result = await createTicket(
        { ...payload, description: finalDescription, attachments },
        {
          signal: abortController.signal,
          onUploadProgress: (progressEvent) => {
            if (progressEvent.total) {
              setUploadProgress(
                Math.min(
                  100,
                  Math.round(
                    (progressEvent.loaded / progressEvent.total) * 100,
                  ),
                ),
              );
            }
          },
        },
      );

      // Tạo ticket thành công: thu hồi toàn bộ Blob URL preview, làm mới cache danh sách/dashboard và điều hướng tới ticket mới
      previewUrlsRef.current.forEach((previewUrl) =>
        URL.revokeObjectURL(previewUrl),
      );
      previewUrlsRef.current.clear();
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success(result.message || "Tạo yêu cầu thành công.");
      navigate(`/user/tickets/${result.ticket._id}`, { replace: true });
    } catch (error) {
      // Bỏ qua nếu request bị hủy chủ động khi unmount
      if (error.code === "ERR_CANCELED") {
        return;
      }

      // Chuẩn hóa thông báo lỗi từ server và đưa focus bàn phím về hộp thông báo lỗi
      setApiError(getCreateTicketError(error));
      window.requestAnimationFrame(() => apiErrorRef.current?.focus());
    } finally {
      // Chỉ dọn trạng thái nếu controller hiện tại vẫn là request mới nhất
      if (requestControllerRef.current === abortController) {
        requestControllerRef.current = null;
        setIsSubmitting(false);
        setUploadProgress(null);
      }
    }
  }

  // Handler khi người dùng xác nhận đã tự sửa được lỗi qua modal hướng dẫn: đóng modal, thông báo và quay về trang tổng quan
  function handleSelfResolved() {
    setShowTroubleshootModal(false);
    toast.success(
      "Tuyệt vời! Bạn đã tự khắc phục thành công sự cố mà không cần chờ IT. Chúc bạn làm việc hiệu quả!",
      { autoClose: 6000 },
    );
    navigate("/user/overview");
  }

  // Handler khi người dùng đã xem hướng dẫn nhưng vẫn chưa xử lý được: đóng modal và gửi ticket kèm ghi chú tự kiểm tra
  function handleConfirmSendToHelpDesk() {
    setShowTroubleshootModal(false);
    executeSubmitTicket({ confirmedNewIssue: true, formData: getValues() });
  }

  // Thông báo lỗi tải danh mục và cờ khóa tính năng chọn danh mục/submit khi danh mục chưa sẵn sàng
  const categoryErrorMessage = categoryError
    ? getCategoryErrorMessage(categoryError)
    : "";
  const categoryUnavailable =
    isLoading || Boolean(categoryError) || categories.length === 0;

  return (
    <form
      noValidate
      aria-busy={isSubmitting}
      onSubmit={(event) => handleSubmit(onValidSubmit)(event)}
      className="overflow-hidden rounded-xl border border-brand-bone bg-white shadow-xs"
    >
      {/* Nhóm các trường nhập liệu, tự khóa toàn bộ khi biểu mẫu đang gửi lên server */}
      <fieldset disabled={isSubmitting} className="space-y-5 p-5 sm:p-6">
        <legend className="sr-only">Thông tin yêu cầu hỗ trợ</legend>

        {/* Trường nhập tiêu đề sự cố kèm bộ đếm tối đa 200 ký tự */}
        <div>
          <label
            htmlFor="ticket-title"
            className="block text-xs font-bold text-brand-ink"
          >
            Tiêu đề sự cố / Yêu cầu
            <RequiredMark />
          </label>
          <input
            id="ticket-title"
            type="text"
            maxLength={200}
            autoComplete="off"
            placeholder="VD: Không truy cập được VPN công ty từ nhà..."
            className={`${inputClassName} ${errors.title ? "border-red-400 focus:border-red-500" : ""}`}
            aria-invalid={Boolean(errors.title)}
            aria-describedby={`ticket-title-hint ticket-title-count${errors.title ? " ticket-title-error" : ""}`}
            {...register("title", { onChange: () => setApiError(null) })}
          />
          <div className="mt-1 flex items-start justify-between gap-3 text-[11px] text-brand-ash">
            <p id="ticket-title-hint">Tóm tắt ngắn gọn sự cố bạn đang gặp.</p>
            <span id="ticket-title-count" className="shrink-0 font-mono">
              {watchedTitle.length}/200
            </span>
          </div>
          {errors.title ? (
            <p id="ticket-title-error" className="mt-1 text-xs text-red-600">
              {errors.title.message}
            </p>
          ) : null}
        </div>

        {/* Hàng 3 cột: chọn danh mục sự cố, mức độ ưu tiên và kỹ thuật viên phụ trách (tùy chọn) */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Cột 1: Dropdown danh mục sự cố kèm thông báo lỗi tải & nút tải lại */}
          <div>
            <label
              htmlFor="ticket-category"
              className="block text-xs font-bold text-brand-ink"
            >
              Danh mục sự cố
              <RequiredMark />
            </label>
            <select
              id="ticket-category"
              disabled={isSubmitting || categoryUnavailable}
              className={`${inputClassName} font-medium ${errors.category ? "border-red-400 focus:border-red-500" : ""}`}
              aria-invalid={Boolean(errors.category)}
              aria-describedby={
                errors.category ? "ticket-category-error" : undefined
              }
              {...register("category", { onChange: () => setApiError(null) })}
            >
              <option value="">
                {isLoading ? "Đang tải danh mục..." : "Chọn danh mục"}
              </option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            {errors.category ? (
              <p
                id="ticket-category-error"
                className="mt-1 text-xs text-red-600"
              >
                {errors.category.message}
              </p>
            ) : null}
            {categoryErrorMessage ? (
              <div
                className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800"
                role="alert"
              >
                <p>{categoryErrorMessage}</p>
                <button
                  type="button"
                  onClick={refetch}
                  className="mt-1 inline-flex items-center gap-1 font-semibold underline"
                >
                  <RefreshCw className="size-3.5" aria-hidden="true" />
                  Tải lại danh mục
                </button>
              </div>
            ) : null}
            {!isLoading && !categoryError && categories.length === 0 ? (
              <p className="mt-2 text-xs text-amber-700" role="status">
                Chưa có danh mục đang hoạt động. Vui lòng liên hệ Admin.
              </p>
            ) : null}
          </div>

          {/* Cột 2: Dropdown mức độ ưu tiên kèm giải thích mức độ ảnh hưởng tương ứng */}
          <div>
            <label
              htmlFor="ticket-priority"
              className="block text-xs font-bold text-brand-ink"
            >
              Mức độ ảnh hưởng (Priority)
              <RequiredMark />
            </label>
            <select
              id="ticket-priority"
              className={`${inputClassName} font-medium ${errors.priority ? "border-red-400 focus:border-red-500" : ""}`}
              aria-invalid={Boolean(errors.priority)}
              aria-describedby="ticket-priority-hint"
              {...register("priority", { onChange: () => setApiError(null) })}
            >
              {PRIORITY_OPTIONS.map((priority) => (
                <option key={priority.value} value={priority.value}>
                  {priority.label}
                </option>
              ))}
            </select>
            <p
              id="ticket-priority-hint"
              className="mt-1 text-[11px] text-brand-ash"
            >
              {
                PRIORITY_OPTIONS.find(
                  (priority) => priority.value === watchedPriority,
                )?.description
              }
            </p>
          </div>

          {/* Cột 3: Dropdown chọn kỹ thuật viên phụ trách (không bắt buộc) */}
          <div>
            <label
              htmlFor="ticket-technician"
              className="block text-xs font-bold text-brand-ink"
            >
              Kỹ thuật viên phụ trách
              <span className="ml-1 text-[11px] font-normal text-brand-ash">
                (Tùy chọn)
              </span>
            </label>
            <select
              id="ticket-technician"
              disabled={isSubmitting || techniciansLoading}
              className={`${inputClassName} font-medium`}
              {...register("technicianId", {
                onChange: () => setApiError(null),
              })}
            >
              <option value="">
                {techniciansLoading
                  ? "Đang tải kỹ thuật viên..."
                  : "-- Tự động / Tiếp nhận sau --"}
              </option>
              {technicians.map((technician) => (
                <option key={technician._id} value={technician._id}>
                  {technician.fullName}
                  {technician.department ? ` (${technician.department})` : ""}
                </option>
              ))}
            </select>
            <p
              id="ticket-technician-hint"
              className="mt-1 text-[11px] text-brand-ash"
            >
              Chỉ định kỹ thuật viên phụ trách ngay hoặc để trống để admin/tech tự tiếp nhận.
            </p>
          </div>
        </div>

        {/* Banner gợi ý trợ lý tự phục vụ, xuất hiện khi danh mục chọn có hướng dẫn sửa lỗi tương ứng */}
        {selectedCategoryObj && relevantGuides.length > 0 && (
          <div className="rounded-xl border border-purple-200 bg-purple-50/70 p-4 text-xs text-brand-onyx flex items-start gap-3 shadow-2xs">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-brand-violet text-white">
              <Sparkles className="size-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold text-brand-violet text-sm">
                  💡 Trợ lý tự phục vụ: Tìm thấy {relevantGuides.length} giải pháp sửa lỗi nhanh cho &quot;{selectedCategoryObj.name}&quot;
                </span>
                <button
                  type="button"
                  onClick={() => setShowTroubleshootModal(true)}
                  className="font-bold text-brand-violet hover:text-purple-900 underline text-xs"
                >
                  Xem các bước sửa lỗi ngay &rarr;
                </button>
              </div>
              <p className="text-xs text-brand-slate mt-1 leading-relaxed">
                Khi bạn bấm nút &quot;Tạo Ticket&quot;, hệ thống sẽ gợi ý các bước thông dụng để bạn thử trước. Nếu đã sửa xong, bạn không cần chờ IT. Nếu vẫn không được hoặc là lỗi mới, bạn chỉ cần 1 click xác nhận để chuyển thẳng lên Help Desk!
              </p>
            </div>
          </div>
        )}

        {/* Trường nhập mô tả chi tiết sự cố kèm bộ đếm tối đa 5000 ký tự */}
        <div>
          <label
            htmlFor="ticket-description"
            className="block text-xs font-bold text-brand-ink"
          >
            Mô tả chi tiết &amp; Thông báo lỗi
            <RequiredMark />
          </label>
          <textarea
            id="ticket-description"
            rows={6}
            maxLength={5000}
            placeholder="Mô tả chi tiết mã lỗi, thời điểm xảy ra hoặc đính kèm ID UltraViewer/TeamViewer nếu cần hỗ trợ từ xa..."
            className={`${inputClassName} min-h-36 resize-y ${errors.description ? "border-red-400 focus:border-red-500" : ""}`}
            aria-invalid={Boolean(errors.description)}
            aria-describedby={`ticket-description-hint ticket-description-count${errors.description ? " ticket-description-error" : ""}`}
            {...register("description", { onChange: () => setApiError(null) })}
          />
          <div className="mt-1 flex items-start justify-between gap-3 text-[11px] text-brand-ash">
            <p id="ticket-description-hint">
              Càng đầy đủ thông tin, bộ phận kỹ thuật càng dễ hỗ trợ nhanh.
            </p>
            <span
              id="ticket-description-count"
              className="shrink-0 font-mono"
            >
              {watchedDescription.length}/5000
            </span>
          </div>
          {errors.description ? (
            <p
              id="ticket-description-error"
              className="mt-1 text-xs text-red-600"
            >
              {errors.description.message}
            </p>
          ) : null}
        </div>

        {/* Vùng chọn, kéo-thả và xem trước hình ảnh đính kèm */}
        <ImageAttachmentField
          attachments={attachments}
          disabled={isSubmitting}
          error={attachmentError}
          maxFiles={clientEnv.maxFilesPerTicket}
          maxFileSizeMb={clientEnv.maxFileSizeMb}
          onFilesSelected={handleFilesSelected}
          onRemove={handleRemoveAttachment}
        />

        {/* Khối thông báo lỗi trả về từ API khi tạo ticket thất bại */}
        {apiError ? (
          <div
            ref={apiErrorRef}
            tabIndex={-1}
            className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-900 outline-none"
            role="alert"
          >
            <div className="flex items-start gap-2.5">
              <AlertCircle
                className="mt-0.5 size-4 shrink-0"
                aria-hidden="true"
              />
              <div>
                <p className="font-bold">Không thể tạo yêu cầu</p>
                <p className="mt-1 leading-5">{apiError.message}</p>
                {apiError.details.length > 0 ? (
                  <ul className="mt-1.5 list-disc space-y-1 pl-4">
                    {apiError.details.map((detail) => (
                      <li key={detail}>{detail}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
      </fieldset>

      {/* Thanh hành động chân form: hủy quay lại danh sách hoặc gửi tạo ticket (kèm % tiến độ upload) */}
      <div className="flex flex-col-reverse gap-2.5 border-t border-brand-bone bg-brand-mist/50 px-5 py-4 sm:flex-row sm:items-center sm:justify-end sm:px-6">
        <button
          type="button"
          disabled={isSubmitting}
          onClick={() => navigate("/user/tickets")}
          className="inline-flex items-center justify-center rounded-lg border border-brand-bone bg-white px-4 py-2 text-xs font-semibold text-brand-slate transition hover:bg-brand-mist hover:text-brand-ink disabled:opacity-60"
        >
          Hủy Bỏ
        </button>
        <button
          type="submit"
          disabled={isSubmitting || categoryUnavailable}
          className="inline-flex items-center justify-center gap-1.5 rounded-full bg-brand-ink px-5 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-brand-carbon disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSubmitting ? (
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Send className="size-3.5" aria-hidden="true" />
          )}
          {isSubmitting
            ? uploadProgress === null
              ? "Đang tạo ticket..."
              : `Đang tải lên ${uploadProgress}%`
            : "Tạo Ticket & Bắt Đầu Tính SLA"}
        </button>
      </div>

      {/* Modal tự kiểm tra hướng dẫn khắc phục nhanh trước khi xác nhận gửi ticket lên IT Help Desk */}
      {showTroubleshootModal && (
        <TroubleshootingConfirmationModal
          categoryName={selectedCategoryObj?.name || "Sự cố kỹ thuật"}
          guides={relevantGuides}
          ticketTitle={watchedTitle}
          isSubmitting={isSubmitting}
          onClose={() => setShowTroubleshootModal(false)}
          onSelfResolved={handleSelfResolved}
          onConfirmSendToHelpDesk={handleConfirmSendToHelpDesk}
        />
      )}
    </form>
  );
}

export default TicketRequestForm;
