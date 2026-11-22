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

const INITIAL_VALUES = Object.freeze({
  title: "",
  category: "",
  priority: "medium",
  technicianId: "",
  description: "",
});

const inputClassName =
  "mt-1.5 w-full rounded-xl border border-brand-bone bg-brand-mist px-3.5 py-2.5 text-sm text-brand-ink outline-none transition placeholder:text-brand-ash focus:border-brand-violet focus:bg-white focus:ring-2 focus:ring-brand-violet/20 disabled:cursor-not-allowed disabled:opacity-60";

function getFileSignature(file) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function createAttachmentId() {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `attachment-${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
}

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

function TicketRequestForm() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const {
    categories,
    error: categoryError,
    isLoading,
    refetch,
  } = useActiveCategories();
  const {
    technicians,
    isLoading: techniciansLoading,
  } = useActiveTechnicians(true);
  const [attachmentError, setAttachmentError] = useState("");
  const [attachments, setAttachments] = useState([]);
  const [apiError, setApiError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [showTroubleshootModal, setShowTroubleshootModal] = useState(false);
  const apiErrorRef = useRef(null);
  const requestControllerRef = useRef(null);
  const previewUrlsRef = useRef(new Set());

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

  const selectedCategoryObj = useMemo(() => {
    return (
      categories.find((category) => category.id === watchedCategory) || null
    );
  }, [categories, watchedCategory]);

  const relevantGuides = useMemo(() => {
    if (!selectedCategoryObj) return [];
    return getTroubleshootingGuidesForTicket({
      category: selectedCategoryObj,
      title: watchedTitle,
      description: watchedDescription,
    });
  }, [selectedCategoryObj, watchedTitle, watchedDescription]);

  useEffect(() => {
    const previewUrls = previewUrlsRef.current;

    return () => {
      requestControllerRef.current?.abort();
      previewUrls.forEach((previewUrl) => URL.revokeObjectURL(previewUrl));
      previewUrls.clear();
    };
  }, []);

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
      const validationMessage = validateImageFile(
        file,
        clientEnv.maxFileSizeMb,
      );
      const signature = getFileSignature(file);

      if (validationMessage) {
        rejectedMessages.push(validationMessage);
        return;
      }

      if (currentSignatures.has(signature)) {
        rejectedMessages.push(`${file.name}: ảnh này đã được chọn.`);
        return;
      }

      if (acceptedAttachments.length >= availableSlots) {
        if (!rejectedMessages.some((message) => message.includes("tối đa"))) {
          rejectedMessages.push(
            `Mỗi yêu cầu chỉ được đính kèm tối đa ${clientEnv.maxFilesPerTicket} ảnh.`,
          );
        }
        return;
      }

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

  function onValidSubmit(formData) {
    if (isSubmitting) {
      return;
    }

    setApiError(null);

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

  async function executeSubmitTicket({ confirmedNewIssue = false, formData } = {}) {
    const payload = formData ?? getValues();
    const abortController = new AbortController();
    requestControllerRef.current = abortController;
    setIsSubmitting(true);
    setUploadProgress(null);

    // Nếu người dùng đã thử khắc phục theo danh mục nhưng chưa hết lỗi, gắn thêm ghi chú rõ ràng
    const finalDescription = confirmedNewIssue
      ? `[Đã tự thử kiểm tra theo hướng dẫn danh mục "${selectedCategoryObj?.name || ""}" nhưng chưa hết lỗi]\n\n${payload.description}`
      : payload.description;

    try {
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

      previewUrlsRef.current.forEach((previewUrl) =>
        URL.revokeObjectURL(previewUrl),
      );
      previewUrlsRef.current.clear();
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success(result.message || "Tạo yêu cầu thành công.");
      navigate(`/user/tickets/${result.ticket._id}`, { replace: true });
    } catch (error) {
      if (error.code === "ERR_CANCELED") {
        return;
      }

      setApiError(getCreateTicketError(error));
      window.requestAnimationFrame(() => apiErrorRef.current?.focus());
    } finally {
      if (requestControllerRef.current === abortController) {
        requestControllerRef.current = null;
        setIsSubmitting(false);
        setUploadProgress(null);
      }
    }
  }

  function handleSelfResolved() {
    setShowTroubleshootModal(false);
    toast.success(
      "Tuyệt vời! Bạn đã tự khắc phục thành công sự cố mà không cần chờ IT. Chúc bạn làm việc hiệu quả!",
      { autoClose: 6000 },
    );
    navigate("/user/overview");
  }

  function handleConfirmSendToHelpDesk() {
    setShowTroubleshootModal(false);
    executeSubmitTicket({ confirmedNewIssue: true, formData: getValues() });
  }

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
      <fieldset disabled={isSubmitting} className="space-y-5 p-5 sm:p-6">
        <legend className="sr-only">Thông tin yêu cầu hỗ trợ</legend>

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

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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

        <ImageAttachmentField
          attachments={attachments}
          disabled={isSubmitting}
          error={attachmentError}
          maxFiles={clientEnv.maxFilesPerTicket}
          maxFileSizeMb={clientEnv.maxFileSizeMb}
          onFilesSelected={handleFilesSelected}
          onRemove={handleRemoveAttachment}
        />

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
