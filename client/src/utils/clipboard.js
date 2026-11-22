/**
 * @file clipboard.js
 * @description Tiện ích sao chép văn bản vào clipboard trên nhiều môi trường trình duyệt.
 * Vai trò trong kiến trúc Frontend: Thuộc tầng Utility helpers, hỗ trợ cả ngữ cảnh bảo mật (HTTPS / localhost)
 * lẫn môi trường HTTP qua IP mạng LAN (fallback bằng `textarea` ẩn và `document.execCommand`).
 */

/**
 * Sao chép chuỗi vào clipboard, hỗ trợ cả ngữ cảnh bảo mật (HTTPS / localhost)
 * lẫn môi trường HTTP qua IP mạng LAN (fallback bằng execCommand).
 *
 * @param {string | number} text - Nội dung văn bản cần sao chép vào bộ nhớ tạm.
 * @returns {Promise<boolean>} Trả về `true` nếu sao chép thành công, ném lỗi nếu rỗng hoặc bị chặn.
 */
export async function copyTextToClipboard(text) {
  const value = String(text ?? "");
  if (!value) {
    throw new Error("Không có nội dung để sao chép.");
  }

  // Nhánh ưu tiên: Chỉ sử dụng Clipboard API hiện đại trong Secure Context (HTTPS hoặc localhost)
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

  // Nhánh fallback cho HTTP LAN: tạo textarea ẩn ngoài khung nhìn để thực hiện lệnh copy cổ điển
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "-9999px";
  textarea.style.left = "-9999px";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);

  // Lưu lại vùng văn bản đang được người dùng bôi đen (nếu có) để khôi phục sau khi sao chép
  const selection = document.getSelection();
  const previousRange =
    selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;

  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, value.length);

  let copied;
  try {
    // Thực thi lệnh sao chép đồng bộ qua execCommand("copy")
    copied = document.execCommand("copy");
  } finally {
    // Luôn dọn sạch textarea tạm và khôi phục selection gốc cho trang
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
