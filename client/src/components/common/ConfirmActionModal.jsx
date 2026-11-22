import { useState } from "react";
import { AlertTriangle, LoaderCircle } from "lucide-react";
import { Button } from "../ui/button.jsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog.jsx";

function ConfirmActionModal({
  title,
  description,
  confirmLabel,
  noteLabel,
  notePlaceholder,
  submitting,
  error,
  onCancel,
  onConfirm,
}) {
  const [note, setNote] = useState("");

  function handleOpenChange(open) {
    if (!open && !submitting) {
      onCancel();
    }
  }

  return (
    <Dialog open onOpenChange={handleOpenChange}>
      <DialogContent
        hideClose={submitting}
        onEscapeKeyDown={(event) => {
          if (submitting) event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          if (submitting) event.preventDefault();
        }}
        className="p-0"
      >
        <DialogHeader className="flex-row items-start gap-4 space-y-0 pr-12">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-700">
            <AlertTriangle className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription className="mt-1.5">
              {description}
            </DialogDescription>
          </div>
        </DialogHeader>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            onConfirm(note.trim());
          }}
        >
          {noteLabel || error ? (
            <div className="p-5 sm:p-6">
              {noteLabel ? (
                <div>
                  <label
                    htmlFor="confirm-action-note"
                    className="text-sm font-semibold text-slate-800"
                  >
                    {noteLabel}
                  </label>
                  <textarea
                    id="confirm-action-note"
                    value={note}
                    maxLength={500}
                    rows={4}
                    disabled={submitting}
                    placeholder={notePlaceholder}
                    onChange={(event) => setNote(event.target.value)}
                    className="mt-2 min-h-28 w-full resize-y rounded-lg border border-slate-300 px-3.5 py-2.5 text-base text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-3 focus:ring-blue-100 disabled:bg-slate-100 sm:text-sm"
                  />
                  <p className="mt-1.5 text-right text-xs text-slate-500">
                    {note.length}/500
                  </p>
                </div>
              ) : null}

              {error ? (
                <div
                  className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800"
                  role="alert"
                >
                  <p>{error.message}</p>
                  {error.details?.length > 0 ? (
                    <ul className="mt-1 list-disc pl-5">
                      {error.details.map((detail) => (
                        <li key={detail}>{detail}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={submitting}
              onClick={onCancel}
            >
              Quay lại
            </Button>
            <Button type="submit" variant="destructive" disabled={submitting}>
              {submitting ? (
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              ) : null}
              {submitting ? "Đang xử lý..." : confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default ConfirmActionModal;
