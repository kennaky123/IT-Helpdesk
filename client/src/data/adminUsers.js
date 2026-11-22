export const USER_STATUS = {
  active: { label: "Đang hoạt động", classes: "bg-emerald-50 text-emerald-700 ring-emerald-600/20" },
  inactive: { label: "Bị khóa", classes: "bg-red-50 text-red-700 ring-red-600/20" },
  locked: { label: "Bị khóa", classes: "bg-red-50 text-red-700 ring-red-600/20" },
  unverified: { label: "Chưa xác thực", classes: "bg-amber-50 text-amber-700 ring-amber-600/20" },
};

export const USER_ROLE = {
  user: { label: "Người dùng", classes: "bg-slate-100 text-slate-700" },
  technician: { label: "Kỹ thuật viên", classes: "bg-purple-50 text-brand-violet" },
  admin: { label: "Quản trị viên", classes: "bg-blue-50 text-blue-700" },
};
