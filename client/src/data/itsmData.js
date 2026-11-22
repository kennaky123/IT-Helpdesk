export const KB_ARTICLES = [
  {
    id: "kb-01",
    title: "Hướng dẫn cài đặt và đăng nhập VPN Fortinet & GlobalProtect từ xa",
    category: "Mạng & VPN",
    summary:
      "Các bước kết nối vào mạng nội bộ công ty an toàn qua VPN Fortinet / GlobalProtect khi làm việc tại nhà (WFA).",
    content:
      "1. Tải ứng dụng VPN Fortinet / GlobalProtect tại portal nội bộ: https://vpn.corp.vn\n2. Cổng kết nối (Portal Address): vpn.corp.vn\n3. Đăng nhập bằng email công ty và xác thực mã 2FA trên ứng dụng Microsoft Authenticator.\n4. Nếu gặp lỗi Gateway Unreachable, vui lòng kiểm tra kết nối mạng hoặc thử đổi DNS sang 1.1.1.1.",
    answer:
      "1. Tải ứng dụng VPN Fortinet / GlobalProtect tại portal nội bộ: https://vpn.corp.vn\n2. Cổng kết nối (Portal Address): vpn.corp.vn\n3. Đăng nhập bằng email công ty và xác thực mã 2FA trên ứng dụng Microsoft Authenticator.\n4. Nếu gặp lỗi Gateway Unreachable, vui lòng kiểm tra kết nối mạng hoặc thử đổi DNS sang 1.1.1.1.",
    views: 1420,
  },
  {
    id: "kb-02",
    title: "Cách kết nối máy in văn phòng các tầng qua mạng Wi-Fi",
    category: "Phần cứng",
    summary:
      "Hướng dẫn map địa chỉ IP máy in HP / Canon cho máy tính Windows và macOS.",
    content:
      "1. Đảm bảo laptop đã kết nối đúng Wi-Fi 'Corp-Internal-5G'.\n2. Trên Windows: Mở Settings -> Printers & Scanners -> Add device -> 'The printer that I want isn't listed' -> Add using IP address: 192.168.1.250.\n3. Trên macOS: Mở System Settings -> Printers -> bấm dấu (+) -> chọn tab IP -> Nhập IP 192.168.1.250 với giao thức LPD.",
    answer:
      "1. Đảm bảo laptop đã kết nối đúng Wi-Fi 'Corp-Internal-5G'.\n2. Trên Windows: Mở Settings -> Printers & Scanners -> Add device -> 'The printer that I want isn't listed' -> Add using IP address: 192.168.1.250.\n3. Trên macOS: Mở System Settings -> Printers -> bấm dấu (+) -> chọn tab IP -> Nhập IP 192.168.1.250 với giao thức LPD.",
    views: 980,
  },
  {
    id: "kb-03",
    title: "Tự reset mật khẩu AD (Active Directory) & Microsoft 365 khi bị khóa",
    category: "Tài khoản",
    summary:
      "Quy trình mở khóa tài khoản AD và đặt lại mật khẩu tự phục vụ (SSPR) nhanh chóng mà không cần chờ IT.",
    content:
      "1. Truy cập https://passwordreset.microsoftonline.com hoặc cổng AD SSPR nội bộ.\n2. Nhập email công ty và mã captcha.\n3. Chọn phương thức xác minh qua số điện thoại hoặc app Microsoft Authenticator.\n4. Đặt mật khẩu mới tối thiểu 12 ký tự (gồm chữ hoa, chữ thường, số và ký tự đặc biệt).",
    answer:
      "1. Truy cập https://passwordreset.microsoftonline.com hoặc cổng AD SSPR nội bộ.\n2. Nhập email công ty và mã captcha.\n3. Chọn phương thức xác minh qua số điện thoại hoặc app Microsoft Authenticator.\n4. Đặt mật khẩu mới tối thiểu 12 ký tự (gồm chữ hoa, chữ thường, số và ký tự đặc biệt).",
    views: 2150,
  },
  {
    id: "kb-04",
    title: "Cách cài đặt bộ phần mềm Microsoft Office 365 có bản quyền",
    category: "Phần mềm",
    summary:
      "Hướng dẫn tải và kích hoạt Word, Excel, PowerPoint, Teams trên máy mới.",
    content:
      "1. Mở trình duyệt vào trang https://portal.office.com\n2. Đăng nhập bằng tài khoản email công ty.\n3. Bấm nút 'Install apps' ở góc trên bên phải màn hình.\n4. Chạy file cài đặt và mở một ứng dụng bất kỳ để tự động nhận bản quyền theo tài khoản.",
    answer:
      "1. Mở trình duyệt vào trang https://portal.office.com\n2. Đăng nhập bằng tài khoản email công ty.\n3. Bấm nút 'Install apps' ở góc trên bên phải màn hình.\n4. Chạy file cài đặt và mở một ứng dụng bất kỳ để tự động nhận bản quyền theo tài khoản.",
    views: 1840,
  },
];

export const CANNED_RESPONSES = [
  {
    id: "vpn-steps",
    label: "Hướng dẫn kết nối lại VPN Pulse/GlobalProtect",
    content:
      "Chào anh/chị, em gửi hướng dẫn kết nối lại VPN:\n1. Bấm chuột phải biểu tượng GlobalProtect ở thanh Taskbar -> chọn 'Disable' rồi 'Enable' lại.\n2. Đổi cổng sang 'vpn-backup.corp.vn' nếu cổng chính đang bảo trì.\n3. Nhập mật khẩu và xác nhận phê duyệt trên app Authenticator trên điện thoại.",
  },
  {
    id: "screenshot-request",
    label: "Yêu cầu gửi bổ sung ảnh chụp màn hình thông báo lỗi",
    content:
      "Chào anh/chị, để IT hỗ trợ kiểm tra chính xác, nhờ anh/chị chụp ảnh màn hình toàn bộ thông báo lỗi hiển thị kèm mã số lỗi rồi gửi lại giúp em tại ticket này nhé ạ.",
  },
  {
    id: "pwd-reset-done",
    label: "Đã reset mật khẩu tài khoản và cấp mã OTP tạm",
    content:
      "Chào anh/chị, IT đã reset mật khẩu tạm thời cho tài khoản của anh/chị:\n- Mật khẩu tạm: Password@2026\n- Vui lòng đổi lại mật khẩu cá nhân ngay tại lần đăng nhập đầu tiên.",
  },
  {
    id: "escalated-l3",
    label: "Đã chuyển sự cố sang Chuyên gia Hạ tầng & Mạng (Tier 3)",
    content:
      "Ticket của bạn đã được chuyển tiếp đến đội ngũ Chuyên gia Hạ tầng & Hệ thống (Tier 3) để phân tích log máy chủ. Thời gian phản hồi dự kiến trong vòng 60 phút.",
  },
];

const SLA_TARGET_MINUTES = {
  urgent: 120,
  high: 240,
  medium: 480,
  low: 1440,
};

function formatSlaDuration(ms) {
  const totalMinutes = Math.max(1, Math.round(Math.abs(ms) / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}p` : `${minutes}p`;
}

export function getSlaDisplayForTicket(ticket) {
  if (!ticket) {
    return { label: "Còn 2h 0p", color: "text-brand-ink", dot: "bg-emerald-500" };
  }
  if (["resolved", "closed"].includes(ticket.status)) {
    return { label: "Đạt SLA", color: "text-emerald-700", dot: "bg-emerald-500" };
  }
  if (ticket.status === "cancelled") {
    return { label: "Đã hủy", color: "text-slate-500", dot: "bg-slate-400" };
  }

  const targetMinutes = SLA_TARGET_MINUTES[ticket.priority] ?? 480;
  const createdMs = new Date(ticket.createdAt).getTime();
  if (!Number.isFinite(createdMs)) {
    return {
      label: `Mục tiêu ${Math.round(targetMinutes / 60)}h`,
      color: "text-brand-slate",
      dot: "bg-blue-500",
    };
  }

  const remainingMs = createdMs + targetMinutes * 60_000 - Date.now();
  const formatted = formatSlaDuration(remainingMs);

  if (remainingMs <= 0) {
    return {
      label: `Quá hạn ${formatted}`,
      color: "text-red-700",
      dot: "bg-red-600 pulse-sla",
    };
  }
  if (remainingMs <= 30 * 60_000) {
    return {
      label: `Còn ${formatted}`,
      color: "text-red-700",
      dot: "bg-red-600 pulse-sla",
    };
  }
  if (remainingMs <= 90 * 60_000) {
    return {
      label: `Còn ${formatted}`,
      color: "text-amber-700",
      dot: "bg-amber-500",
    };
  }
  return {
    label: `Còn ${formatted}`,
    color: "text-emerald-700",
    dot: "bg-emerald-500",
  };
}

