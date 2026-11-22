/**
 * @file ProfilePage.jsx
 * @description Trang Hồ sơ cá nhân & Bảo mật cho phép người dùng quản lý ảnh đại diện, thông tin liên hệ, đổi mật khẩu và xem danh sách bản quyền phần mềm được cấp phát.
 * @role Tất cả người dùng đã đăng nhập (User / Technician / Admin).
 * @flow
 * 1. Đọc thông tin `user` hiện tại từ `useAuth()` để điền sẵn vào form hồ sơ và đồng bộ lại phiên khi cập nhật thành công.
 * 2. Tải danh sách license phần mềm qua React Query (`getSoftwareLicenses`) và lọc các bản quyền đã cấp cho `user._id`.
 * 3. Xử lý upload ảnh đại diện (validate JPEG/PNG/WebP và <= 5MB), cập nhật hồ sơ (`fullName`, `phone`, `department`), đổi mật khẩu và sao chép License Key.
 */
import { useQuery } from "@tanstack/react-query";
import {
  AppWindow,
  ArrowUpRight,
  Camera,
  Check,
  Copy,
  ExternalLink,
  KeyRound,
  Laptop,
  LoaderCircle,
  Mail,
  Phone,
  Save,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "react-toastify";
import WorkspacePageHeader from "../components/common/WorkspacePageHeader.jsx";
import useAuth from "../hooks/useAuth.js";
import { getSoftwareLicenses } from "../services/softwareService.js";
import {
  changePassword,
  getUserServiceErrorMessage,
  updateUserAvatar,
  updateUserProfile,
} from "../services/userService.js";
import { getAvatarUrl, getInitials } from "../utils/adminUserFormatters.js";
import { copyTextToClipboard } from "../utils/clipboard.js";
import { formatTicketDateTime } from "../utils/ticketPermissions.js";

// Class Tailwind dùng chung cho các ô input trong form thông tin cá nhân và đổi mật khẩu
const inputClass =
  "mt-1.5 w-full rounded-xl border border-brand-bone bg-brand-mist px-3.5 py-2.5 text-xs font-medium text-brand-ink outline-none transition focus:border-brand-violet focus:bg-white disabled:opacity-60";

// Bộ định dạng tháng/năm theo chuẩn Việt Nam (múi giờ Asia/Ho_Chi_Minh) cho mốc thời gian tham gia
const dateFormatter = new Intl.DateTimeFormat("vi-VN", {
  month: "2-digit",
  year: "numeric",
  timeZone: "Asia/Ho_Chi_Minh",
});

/**
 * Component trang Hồ sơ cá nhân & Bảo mật.
 * Quản lý đồng thời 3 luồng tương tác: cập nhật avatar + thông tin cá nhân, đổi mật khẩu và hiển thị bản quyền phần mềm được cấp.
 */
function ProfilePage() {
  // Lấy thông tin người dùng hiện tại và hàm cập nhật session AuthContext sau khi lưu thay đổi
  const { user, updateUserSession } = useAuth();
  // Ref trỏ đến thẻ input file ẩn để kích hoạt chọn ảnh khi bấm nút camera trên avatar
  const avatarInputRef = useRef(null);
  // Trạng thái đang tải lên ảnh đại diện mới
  const [avatarSubmitting, setAvatarSubmitting] = useState(false);

  // State form thông tin cá nhân, khởi tạo từ dữ liệu user hiện tại (email chỉ hiển thị, không cho chỉnh sửa)
  const [profileForm, setProfileForm] = useState({
    fullName: user?.fullName ?? "",
    email: user?.email ?? "",
    phone: user?.phone ?? "",
    department: user?.department ?? "",
  });
  // Trạng thái đang gửi yêu cầu cập nhật thông tin cá nhân
  const [profileSubmitting, setProfileSubmitting] = useState(false);

  // State form đổi mật khẩu gồm mật khẩu hiện tại, mật khẩu mới và xác nhận mật khẩu mới
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmNewPassword: "",
  });
  // Trạng thái đang gửi yêu cầu đổi mật khẩu
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);
  // Lưu ID bản quyền vừa được sao chép key để hiển thị trạng thái "Đã chép" tạm thời
  const [copiedLicenseId, setCopiedLicenseId] = useState(null);

  // React Query tải danh sách bản quyền phần mềm (chỉ chạy khi đã xác định được user._id)
  const softwareQuery = useQuery({
    queryKey: ["software", "list", "profile", user?._id],
    queryFn: ({ signal }) => getSoftwareLicenses({}, { signal }),
    enabled: Boolean(user?._id),
  });

  // Lọc ra các bản quyền phần mềm có phân bổ (assignedUsers) khớp với ID của người dùng đang đăng nhập
  const currentUserId = user?._id ? String(user._id) : "";
  const allocatedLicenses = (softwareQuery.data?.licenses ?? [])
    .map((lic) => {
      const assignment = (lic.assignedUsers ?? []).find(
        (entry) => String(entry.user?._id ?? entry.user ?? "") === currentUserId,
      );
      if (!assignment) return null;
      return { ...lic, assignment };
    })
    .filter(Boolean);

  // Xác định đường dẫn trang "Xem chi tiết" bản quyền phần mềm theo vai trò (role) của tài khoản
  const softwarePath =
    user?.role === "user"
      ? "/user/software"
      : user?.role === "technician"
        ? "/technician/software"
        : "/admin/software";

  /**
   * Sao chép License Key vào clipboard, bật phản hồi trực quan trong 2 giây và thông báo toast.
   */
  async function handleCopyLicenseKey(license) {
    if (!license.licenseKey) return;
    try {
      await copyTextToClipboard(license.licenseKey);
      setCopiedLicenseId(license._id);
      toast.success(`Đã sao chép License Key của ${license.name}`);
      setTimeout(() => {
        setCopiedLicenseId((prev) => (prev === license._id ? null : prev));
      }, 2000);
    } catch {
      toast.error("Không thể sao chép License Key.");
    }
  }

  /**
   * Cập nhật giá trị từng trường trong state form thông tin cá nhân.
   */
  function updateProfileField(name, value) {
    setProfileForm((current) => ({ ...current, [name]: value }));
  }

  /**
   * Cập nhật giá trị từng trường trong state form đổi mật khẩu.
   */
  function updatePasswordField(name, value) {
    setPasswordForm((current) => ({ ...current, [name]: value }));
  }

  /**
   * Event handler xử lý thay đổi ảnh đại diện:
   * kiểm tra định dạng ảnh (JPEG/PNG/WebP) và dung lượng tối đa 5MB trước khi gọi API upload.
   */
  async function handleAvatarChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast.error("Chỉ chấp nhận ảnh JPEG, PNG hoặc WebP.");
      event.target.value = "";
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Dung lượng ảnh không được vượt quá 5MB.");
      event.target.value = "";
      return;
    }

    setAvatarSubmitting(true);
    try {
      const result = await updateUserAvatar(file);
      if (typeof updateUserSession === "function") {
        updateUserSession(result);
      }
      toast.success("Cập nhật ảnh đại diện thành công.");
    } catch (error) {
      toast.error(getUserServiceErrorMessage(error));
    } finally {
      setAvatarSubmitting(false);
      event.target.value = "";
    }
  }

  /**
   * Event handler xử lý submit form cập nhật thông tin cá nhân (`fullName`, `phone`, `department`).
   * Đồng bộ lại phiên đăng nhập sau khi server lưu thành công.
   */
  async function handleProfileSubmit(event) {
    event.preventDefault();
    setProfileSubmitting(true);

    try {
      const result = await updateUserProfile({
        fullName: profileForm.fullName.trim(),
        phone: profileForm.phone.trim(),
        department: profileForm.department.trim(),
      });

      if (typeof updateUserSession === "function") {
        updateUserSession(result);
      }

      toast.success("Cập nhật thông tin cá nhân thành công.");
    } catch (error) {
      toast.error(getUserServiceErrorMessage(error));
    } finally {
      setProfileSubmitting(false);
    }
  }

  /**
   * Event handler xử lý submit form đổi mật khẩu.
   * Kiểm tra mật khẩu xác nhận khớp phía client, gọi API đổi mật khẩu, đồng bộ session và xóa trắng form.
   */
  async function handlePasswordSubmit(event) {
    event.preventDefault();

    if (passwordForm.newPassword !== passwordForm.confirmNewPassword) {
      toast.error("Xác nhận mật khẩu mới không khớp.");
      return;
    }

    setPasswordSubmitting(true);

    try {
      const result = await changePassword({
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
        confirmNewPassword: passwordForm.confirmNewPassword,
      });

      if (typeof updateUserSession === "function") {
        updateUserSession(result);
      }

      setPasswordForm({
        currentPassword: "",
        newPassword: "",
        confirmNewPassword: "",
      });

      toast.success("Đổi mật khẩu thành công.");
    } catch (error) {
      toast.error(getUserServiceErrorMessage(error));
    } finally {
      setPasswordSubmitting(false);
    }
  }

  // Ánh xạ role kỹ thuật sang nhãn tiếng Việt hiển thị trên thẻ hồ sơ
  const roleLabel =
    user?.role === "admin"
      ? "Quản trị viên IT"
      : user?.role === "technician"
        ? "Kỹ thuật viên IT"
        : "Nhân viên nội bộ";

  // Định dạng tháng/năm tham gia hệ thống (mặc định fallback "05/2025" nếu thiếu createdAt)
  const memberSince = user?.createdAt
    ? dateFormatter.format(new Date(user.createdAt))
    : "05/2025";

  // Tạo URL hiển thị ảnh đại diện (trả về null nếu chưa có để render chữ viết tắt tên)
  const avatarUrl = getAvatarUrl(user?.avatar);

  return (
    <section>
      <WorkspacePageHeader
        eyebrow="Tài khoản DeskPro IT"
        title="Hồ sơ cá nhân & Bảo mật"
        description="Quản lý thông tin liên hệ, phòng ban và mật khẩu xác thực của bạn."
      />

      <div className="grid gap-6 xl:grid-cols-[20rem_minmax(0,1fr)]">
        {/* Cột trái: Thẻ thông tin tóm tắt tài khoản, vai trò và chức năng tải lên ảnh đại diện */}
        <aside className="rounded-xl border border-brand-bone bg-white p-6 text-center shadow-xs">
          <div className="relative mx-auto w-fit">
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleAvatarChange}
              className="hidden"
            />
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={user?.fullName || "Avatar"}
                className="size-24 rounded-3xl object-cover shadow-inner"
              />
            ) : (
              <span className="flex size-24 items-center justify-center rounded-3xl bg-brand-violet text-2xl font-bold text-white">
                {getInitials(user?.fullName || profileForm.fullName)}
              </span>
            )}
            <button
              type="button"
              disabled={avatarSubmitting}
              onClick={() => avatarInputRef.current?.click()}
              className="absolute -right-2 -bottom-2 flex size-9 items-center justify-center rounded-full border-4 border-white bg-brand-ink text-white shadow-xs hover:bg-brand-carbon disabled:opacity-60"
              aria-label="Đổi ảnh đại diện"
            >
              {avatarSubmitting ? (
                <LoaderCircle className="size-3.5 animate-spin" />
              ) : (
                <Camera className="size-3.5" />
              )}
            </button>
          </div>
          <h2 className="mt-4 font-display text-base font-extrabold text-brand-ink">
            {user?.fullName || profileForm.fullName}
          </h2>
          <p className="mt-0.5 font-mono text-xs text-brand-ash">
            {user?.email || profileForm.email}
          </p>
          <span className="mt-3 inline-flex rounded-full bg-brand-violet/10 px-3 py-1 text-xs font-bold text-brand-violet">
            {roleLabel}
          </span>
          <div className="mt-5 space-y-2.5 border-t border-brand-bone pt-4 text-left text-xs">
            <p className="flex items-center gap-2.5 text-brand-slate">
              <ShieldCheck className="size-4 text-brand-emerald" />
              Tài khoản SSO đã xác thực
            </p>
            <p className="flex items-center gap-2.5 text-brand-slate">
              <UserRound className="size-4 text-brand-violet" />
              Thành viên từ {memberSince}
            </p>
          </div>
        </aside>

        <div className="space-y-6">
          {/* Form 1: Cập nhật thông tin cá nhân (họ tên, SĐT, phòng ban; trường email bị vô hiệu hóa không cho sửa) */}
          <form
            onSubmit={handleProfileSubmit}
            className="overflow-hidden rounded-xl border border-brand-bone bg-white shadow-xs"
          >
            <div className="border-b border-brand-bone px-5 py-4">
              <h2 className="font-display text-sm font-bold text-brand-ink">
                Thông tin cá nhân
              </h2>
              <p className="mt-0.5 text-xs text-brand-slate">
                Thông tin hiển thị trên phiếu yêu cầu hỗ trợ (Ticket)
              </p>
            </div>
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <label>
                <span className="text-xs font-bold text-brand-ink">
                  Họ và tên
                </span>
                <input
                  type="text"
                  required
                  value={profileForm.fullName}
                  onChange={(e) =>
                    updateProfileField("fullName", e.target.value)
                  }
                  disabled={profileSubmitting}
                  className={inputClass}
                />
              </label>
              <label>
                <span className="text-xs font-bold text-brand-ink">Email</span>
                <span className="relative block">
                  <Mail className="absolute top-1/2 left-3 mt-0.5 size-4 -translate-y-1/2 text-brand-ash" />
                  <input
                    type="email"
                    value={profileForm.email}
                    disabled
                    className={`${inputClass} cursor-not-allowed pl-10 text-brand-ash`}
                  />
                </span>
              </label>
              <label>
                <span className="text-xs font-bold text-brand-ink">
                  Số điện thoại
                </span>
                <span className="relative block">
                  <Phone className="absolute top-1/2 left-3 mt-0.5 size-4 -translate-y-1/2 text-brand-ash" />
                  <input
                    type="tel"
                    value={profileForm.phone}
                    onChange={(e) =>
                      updateProfileField("phone", e.target.value)
                    }
                    disabled={profileSubmitting}
                    placeholder="0910000001"
                    className={`${inputClass} pl-10`}
                  />
                </span>
              </label>
              <label>
                <span className="text-xs font-bold text-brand-ink">
                  Phòng ban
                </span>
                <input
                  type="text"
                  value={profileForm.department}
                  onChange={(e) =>
                    updateProfileField("department", e.target.value)
                  }
                  disabled={profileSubmitting}
                  placeholder="Khối Tài Chính - Kế Toán"
                  className={inputClass}
                />
              </label>
            </div>
            <div className="flex justify-end border-t border-brand-bone bg-brand-mist/40 px-5 py-3.5">
              <button
                type="submit"
                disabled={profileSubmitting}
                className="inline-flex items-center gap-1.5 rounded-full bg-brand-ink px-4 py-2 text-xs font-semibold text-white hover:bg-brand-carbon disabled:opacity-60"
              >
                {profileSubmitting ? (
                  <LoaderCircle className="size-3.5 animate-spin" />
                ) : (
                  <Save className="size-3.5" />
                )}
                Lưu thay đổi
              </button>
            </div>
          </form>

          {/* Form 2: Đổi mật khẩu đăng nhập (kiểm tra độ dài >= 8 ký tự và khớp mật khẩu xác nhận trước khi gửi API) */}
          <form
            onSubmit={handlePasswordSubmit}
            className="overflow-hidden rounded-xl border border-brand-bone bg-white shadow-xs"
          >
            <div className="border-b border-brand-bone px-5 py-4">
              <h2 className="flex items-center gap-2 font-display text-sm font-bold text-brand-ink">
                <KeyRound className="size-4 text-brand-violet" />
                Đổi mật khẩu
              </h2>
            </div>
            <div className="grid gap-4 p-5 sm:grid-cols-3">
              <label>
                <span className="text-xs font-bold text-brand-ink">
                  Mật khẩu hiện tại
                </span>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={passwordForm.currentPassword}
                  onChange={(e) =>
                    updatePasswordField("currentPassword", e.target.value)
                  }
                  disabled={passwordSubmitting}
                  className={inputClass}
                />
              </label>
              <label>
                <span className="text-xs font-bold text-brand-ink">
                  Mật khẩu mới
                </span>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={passwordForm.newPassword}
                  onChange={(e) =>
                    updatePasswordField("newPassword", e.target.value)
                  }
                  disabled={passwordSubmitting}
                  className={inputClass}
                />
              </label>
              <label>
                <span className="text-xs font-bold text-brand-ink">
                  Xác nhận mật khẩu
                </span>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={passwordForm.confirmNewPassword}
                  onChange={(e) =>
                    updatePasswordField("confirmNewPassword", e.target.value)
                  }
                  disabled={passwordSubmitting}
                  className={inputClass}
                />
              </label>
            </div>
            <div className="flex justify-end border-t border-brand-bone bg-brand-mist/40 px-5 py-3.5">
              <button
                type="submit"
                disabled={passwordSubmitting}
                className="inline-flex items-center gap-1.5 rounded-lg border border-brand-bone bg-white px-4 py-2 text-xs font-semibold text-brand-ink hover:bg-brand-mist disabled:opacity-60"
              >
                {passwordSubmitting ? (
                  <LoaderCircle className="size-3.5 animate-spin" />
                ) : null}
                Cập nhật mật khẩu
              </button>
            </div>
          </form>

          {/* Khối 3: Danh sách bản quyền phần mềm đã cấp cho tài khoản, hỗ trợ sao chép Key và mở trang Portal/Chi tiết theo role */}
          <section className="overflow-hidden rounded-xl border border-brand-bone bg-white shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-brand-bone px-5 py-4">
              <div>
                <h2 className="flex items-center gap-2 font-display text-sm font-bold text-brand-ink">
                  <AppWindow className="size-4 text-brand-violet" />
                  Bản quyền phần mềm được cấp
                </h2>
                <p className="mt-0.5 text-xs text-brand-slate">
                  Danh sách phần mềm bản quyền công ty cấp phát theo thiết bị bạn đang sử dụng.
                </p>
              </div>
              <Link
                to={softwarePath}
                className="inline-flex items-center gap-1 rounded-full border border-purple-200 bg-purple-50 px-3 py-1.5 text-xs font-semibold text-brand-violet transition hover:bg-purple-100"
              >
                <span>Xem chi tiết</span>
                <ArrowUpRight className="size-3.5" />
              </Link>
            </div>

            <div className="p-5">
              {softwareQuery.isLoading ? (
                <div className="flex items-center justify-center gap-2 py-8 text-xs text-brand-slate">
                  <LoaderCircle className="size-4 animate-spin text-brand-violet" />
                  <span>Đang tải danh sách bản quyền phần mềm...</span>
                </div>
              ) : softwareQuery.error ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
                  Không thể tải danh sách bản quyền phần mềm.
                </div>
              ) : allocatedLicenses.length === 0 ? (
                <div className="rounded-xl border border-dashed border-brand-bone bg-brand-mist/40 px-4 py-8 text-center">
                  <div className="mx-auto mb-2 flex size-9 items-center justify-center rounded-full bg-white text-brand-ash border border-brand-bone">
                    <AppWindow className="size-4" />
                  </div>
                  <p className="text-xs font-semibold text-brand-ink">
                    Chưa có bản quyền phần mềm nào được cấp
                  </p>
                  <p className="mt-1 text-[11px] text-brand-slate">
                    Bản quyền phần mềm sẽ hiển thị tại đây khi bạn được bàn giao thiết bị công ty và cấp seat sử dụng.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {allocatedLicenses.map((lic) => {
                    const statusBadge =
                      lic.status === "expired"
                        ? {
                            label: "Đã hết hạn",
                            cls: "border-red-200 bg-red-50 text-red-700",
                          }
                        : lic.status === "expiring_soon"
                          ? {
                              label: "Sắp hết hạn",
                              cls: "border-amber-200 bg-amber-50 text-amber-700",
                            }
                          : {
                              label: "Đang hoạt động",
                              cls: "border-emerald-200 bg-emerald-50 text-emerald-700",
                            };
                    const devices = lic.assignment?.devices ?? [];
                    const isCopied = copiedLicenseId === lic._id;

                    return (
                      <div
                        key={lic._id}
                        className="rounded-xl border border-brand-bone bg-brand-mist/25 p-4 transition-colors hover:border-purple-200 hover:bg-white"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-sm font-bold text-brand-onyx">
                                {lic.name}
                              </h3>
                              <span
                                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusBadge.cls}`}
                              >
                                {statusBadge.label}
                              </span>
                            </div>
                            <p className="mt-0.5 text-xs text-brand-slate">
                              <span className="font-medium text-brand-ink">
                                {lic.vendor}
                              </span>
                              {" • "}
                              <span>{lic.category}</span>
                            </p>
                          </div>

                          <div className="flex shrink-0 items-center gap-1.5">
                            {lic.licenseKey && (
                              <button
                                type="button"
                                onClick={() => handleCopyLicenseKey(lic)}
                                className="inline-flex items-center gap-1 rounded-lg border border-brand-bone bg-white px-2.5 py-1.5 text-[11px] font-semibold text-brand-slate transition hover:bg-brand-mist hover:text-brand-ink"
                              >
                                {isCopied ? (
                                  <Check className="size-3.5 text-emerald-600" />
                                ) : (
                                  <Copy className="size-3.5" />
                                )}
                                <span>{isCopied ? "Đã chép" : "Chép Key"}</span>
                              </button>
                            )}
                            {lic.portalUrl && (
                              <a
                                href={lic.portalUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 rounded-lg border border-purple-200 bg-purple-50 px-2.5 py-1.5 text-[11px] font-semibold text-brand-violet transition hover:bg-purple-100"
                              >
                                <ExternalLink className="size-3.5" />
                                <span>Portal</span>
                              </a>
                            )}
                          </div>
                        </div>

                        <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-brand-bone/60 pt-2.5">
                          {devices.map((d) => (
                            <div
                              key={d.assetTag}
                              title={`Đang dùng: ${d.assetTag} • ${d.name}`}
                              className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-purple-200 bg-purple-50/80 px-2.5 py-1 text-[11px] font-mono font-semibold text-brand-violet"
                            >
                              <Laptop className="size-3.5 shrink-0" />
                              <span className="truncate">
                                Đang dùng: {d.assetTag} • {d.name}
                              </span>
                            </div>
                          ))}
                          {lic.licenseKey && (
                            <span className="max-w-full truncate rounded-lg border border-brand-bone bg-white px-2 py-1 font-mono text-[11px] text-brand-slate">
                              Key: {lic.licenseKey}
                            </span>
                          )}
                        </div>

                        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-brand-ash font-mono">
                          <span>
                            Cấp ngày: {formatTicketDateTime(lic.assignment?.assignedAt)}
                          </span>
                          <span>
                            {lic.type === "perpetual"
                              ? "Hiệu lực: Vĩnh viễn"
                              : lic.expiryDate
                                ? `Hết hạn: ${new Date(lic.expiryDate).toLocaleDateString("vi-VN")}`
                                : "Không có ngày hạn"}
                          </span>
                        </div>

                        {lic.assignment?.note && (
                          <div className="mt-2 rounded-lg border border-brand-bone/80 bg-white px-2.5 py-1.5 text-[11px] text-brand-slate break-words">
                            {lic.assignment.note}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}

export default ProfilePage;
