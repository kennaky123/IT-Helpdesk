/**
 * Sao chép chuỗi vào clipboard, hỗ trợ cả ngữ cảnh bảo mật (HTTPS / localhost)
 * lẫn môi trường HTTP qua IP mạng LAN (fallback bằng execCommand).
 */
export async function copyTextToClipboard(text) {
  const value = String(text ?? "");
  if (!value) {
    throw new Error("Không có nội dung để sao chép.");
  }

  if (
    typeof navigator !== "undefined" &&
    window.isSecureContext &&
    navigator.clipboard?.writeText
  ) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      // Fallback sang textarea + execCommand nếu Clipboard API bị từ chối
    }
  }

  if (typeof document === "undefined") {
    throw new Error("Trình duyệt không hỗ trợ sao chép.");
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "-9999px";
  textarea.style.left = "-9999px";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);

  const selection = document.getSelection();
  const previousRange =
    selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;

  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, value.length);

  let copied;
  try {
    copied = document.execCommand("copy");
  } finally {
    document.body.removeChild(textarea);
    if (previousRange && selection) {
      selection.removeAllRanges();
      selection.addRange(previousRange);
    }
  }

  if (!copied) {
    throw new Error("Trình duyệt đã chặn thao tác sao chép.");
  }

  return true;
}
