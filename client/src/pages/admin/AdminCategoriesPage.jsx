/**
 * Trang Quản trị Danh mục Sự cố (Service Catalog).
 *
 * Vai trò trong hệ thống IT Helpdesk:
 * - Cho phép quản trị viên (Admin) thiết lập, chỉnh sửa, bật/tắt trạng thái hiển thị
 *   và xóa các nhóm danh mục sự cố CNTT (Service Catalog).
 * - Các danh mục đang kích hoạt (active) sẽ hiển thị cho người dùng chọn khi tạo ticket mới,
 *   làm cơ sở tự động định tuyến ticket tới bộ phận kỹ thuật và áp dụng chính sách SLA phù hợp.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Edit3,
  FolderCheck,
  FolderX,
  Plus,
  Search,
  Tags,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import WorkspacePageHeader from "../../components/common/WorkspacePageHeader.jsx";
import WorkspaceStatCard from "../../components/common/WorkspaceStatCard.jsx";
import { Button } from "../../components/ui/button.jsx";
import {
  createAdminCategory,
  deleteAdminCategory,
  getAdminCategories,
  getAdminErrorMessage,
  updateAdminCategory,
} from "../../services/adminService.js";
import { normalizeSearch } from "../../utils/adminUserFormatters.js";

/**
 * Component chính của trang quản lý danh mục sự cố dành cho Admin.
 * Điều phối việc tải danh sách danh mục, tìm kiếm cục bộ và các thao tác CRUD qua React Query.
 */
function AdminCategoriesPage() {
  // Client của React Query dùng để làm mới (invalidate) cache sau các thao tác thay đổi dữ liệu
  const queryClient = useQueryClient();
  // Từ khóa tìm kiếm danh mục theo tên hoặc mô tả
  const [search, setSearch] = useState("");
  // Danh mục đang mở form chỉnh sửa ({ id: null } nếu đang thêm mới, null nếu đóng form)
  const [editing, setEditing] = useState(null);
  // Trạng thái dữ liệu nhập trong form thêm/sửa danh mục
  const [form, setForm] = useState({ name: "", description: "", active: true });

  // Luồng lấy dữ liệu: truy vấn toàn bộ danh mục sự cố từ API quản trị (hỗ trợ AbortSignal)
  const { data: categories = [], error: listError } = useQuery({
    queryKey: ["admin", "categories"],
    queryFn: ({ signal }) => getAdminCategories({ signal }),
  });

  // Theo dõi lỗi tải danh sách và hiển thị thông báo toast cho quản trị viên
  useEffect(() => {
    if (listError) {
      toast.error(getAdminErrorMessage(listError));
    }
  }, [listError]);

  /**
   * Làm mới cache React Query cho danh mục ở cả trang quản trị,
   * trang tạo ticket của người dùng và các tùy chọn bộ lọc ticket.
   */
  function invalidateCategories() {
    queryClient.invalidateQueries({ queryKey: ["admin", "categories"] });
    queryClient.invalidateQueries({ queryKey: ["categories"] });
    queryClient.invalidateQueries({ queryKey: ["tickets", "filter-options"] });
  }

  // Mutation tạo mới hoặc cập nhật danh mục tùy thuộc vào sự tồn tại của id
  const saveMutation = useMutation({
    mutationFn: ({ id, values }) =>
      id ? updateAdminCategory(id, values) : createAdminCategory(values),
    onSuccess: (_saved, variables) => {
      // Đồng bộ lại cache danh mục và đóng form sau khi lưu thành công
      invalidateCategories();
      setEditing(null);
      toast.success(
        variables.id ? "Đã cập nhật danh mục." : "Đã thêm danh mục mới.",
      );
    },
    onError: (error) => {
      toast.error(getAdminErrorMessage(error));
    },
  });

  // Mutation bật/tắt nhanh trạng thái hoạt động (Đang sử dụng / Tạm ẩn) của một danh mục
  const toggleMutation = useMutation({
    mutationFn: (item) =>
      updateAdminCategory(item.id, { ...item, active: !item.active }),
    onSuccess: invalidateCategories,
    onError: (error) => {
      toast.error(getAdminErrorMessage(error));
    },
  });

  // Mutation xóa vĩnh viễn danh mục khỏi hệ thống và làm mới cache liên quan
  const deleteMutation = useMutation({
    mutationFn: (item) => deleteAdminCategory(item.id),
    onSuccess: () => {
      invalidateCategories();
      toast.success("Đã xóa danh mục khỏi hệ thống.");
    },
    onError: (error) => {
      toast.error(getAdminErrorMessage(error));
    },
  });

  // Lọc danh sách danh mục phía client theo tên và mô tả (chuẩn hóa bỏ dấu, không phân biệt hoa/thường)
  const filtered = useMemo(
    () =>
      categories.filter((item) =>
        normalizeSearch(`${item.name} ${item.description}`).includes(
          normalizeSearch(search),
        ),
      ),
    [categories, search],
  );

  /**
   * Mở form thêm mới hoặc chỉnh sửa danh mục và khởi tạo giá trị cho state form.
   */
  function openForm(category) {
    setEditing(category || { id: null });
    setForm(
      category
        ? {
            name: category.name,
            description: category.description,
            active: category.active,
          }
        : { name: "", description: "", active: true },
    );
  }

  /**
   * Xử lý submit form lưu danh mục sau khi kiểm tra hợp lệ độ dài tên danh mục.
   */
  function save(event) {
    event.preventDefault();
    if (form.name.trim().length < 2) {
      toast.error("Tên danh mục phải có ít nhất 2 ký tự.");
      return;
    }
    saveMutation.mutate({ id: editing.id, values: form });
  }

  /**
   * Kích hoạt mutation đảo trạng thái kích hoạt (active) của danh mục được chọn.
   */
  function toggleCategory(item) {
    toggleMutation.mutate(item);
  }

  /**
   * Xử lý xóa danh mục: ngăn xóa nếu danh mục đã phát sinh ticket để bảo toàn dữ liệu lịch sử.
   */
  function removeCategory(item) {
    if (item.tickets > 0) {
      toast.warning(
        "Không thể xóa danh mục đã có ticket. Hãy tạm ẩn danh mục.",
      );
      return;
    }
    deleteMutation.mutate(item);
  }

  // Cờ biểu thị trạng thái đang gửi request lưu danh mục để khóa nút submit
  const saving = saveMutation.isPending;

  return (
    <section>
      {/* Tiêu đề trang và nút mở form thêm danh mục mới */}
      <WorkspacePageHeader
        eyebrow="Quản trị phân loại dịch vụ CNTT"
        title="Danh mục sự cố (Service Catalog)"
        description="Thiết lập nhóm sự cố để tự động định tuyến ticket và áp dụng chính sách SLA tương ứng."
        actions={
          <Button type="button" size="pill" onClick={() => openForm()}>
            <Plus className="size-4" />
            Thêm danh mục
          </Button>
        }
      />

      {/* Lưới thẻ thống kê nhanh số lượng danh mục theo trạng thái */}
      <div className="grid gap-4 sm:grid-cols-3">
        <WorkspaceStatCard
          icon={Tags}
          label="Tổng danh mục"
          value={categories.length}
          description="Nhóm sự cố trong hệ thống"
        />
        <WorkspaceStatCard
          icon={FolderCheck}
          label="Đang sử dụng"
          value={categories.filter((item) => item.active).length}
          description="Hiển thị khi tạo ticket"
          tone="emerald"
        />
        <WorkspaceStatCard
          icon={FolderX}
          label="Tạm ẩn"
          value={categories.filter((item) => !item.active).length}
          description="Không nhận ticket mới"
          tone="amber"
        />
      </div>

      {/* Form inline thêm mới hoặc chỉnh sửa danh mục khi state editing khác null */}
      {editing ? (
        <form
          onSubmit={save}
          className="mt-6 rounded-xl border border-brand-violet/30 bg-white p-5 shadow-xs"
        >
          <div className="flex items-center justify-between">
            <h2 className="font-display text-sm font-bold text-brand-ink">
              {editing.id ? "Chỉnh sửa danh mục" : "Thêm danh mục mới"}
            </h2>
            <button
              type="button"
              disabled={saving}
              onClick={() => setEditing(null)}
              className="flex size-8 items-center justify-center rounded-lg hover:bg-brand-mist"
            >
              <X className="size-4" />
            </button>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-[18rem_1fr_auto]">
            <input
              autoFocus
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Tên danh mục"
              className="rounded-lg border border-brand-bone bg-brand-mist px-3 py-2 text-xs font-medium text-brand-ink outline-none focus:border-brand-violet focus:bg-white"
            />
            <input
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
              placeholder="Mô tả phạm vi sự cố"
              className="rounded-lg border border-brand-bone bg-brand-mist px-3 py-2 text-xs font-medium text-brand-ink outline-none focus:border-brand-violet focus:bg-white"
            />
            <button
              disabled={saving}
              className="rounded-lg bg-brand-violet px-4 py-2 text-xs font-semibold text-white hover:bg-brand-violet/90 disabled:opacity-60"
            >
              {saving ? "Đang lưu..." : editing.id ? "Lưu thay đổi" : "Thêm mới"}
            </button>
          </div>
        </form>
      ) : null}

      {/* Thanh tìm kiếm danh mục theo thời gian thực */}
      <div className="mt-6 rounded-xl border border-brand-bone bg-white p-3.5 shadow-xs">
        <label className="relative block max-w-xl">
          <Search className="absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-brand-ash" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm kiếm danh mục..."
            className="w-full rounded-lg border border-brand-bone bg-brand-mist py-2 pr-3 pl-10 text-xs font-medium text-brand-ink outline-none focus:border-brand-violet focus:bg-white"
          />
        </label>
      </div>

      {/* Vùng hiển thị danh sách danh mục: bảng cho desktop (md+) và dạng thẻ cho mobile */}
      <div className="mt-4 overflow-hidden rounded-xl border border-brand-bone bg-white shadow-xs">
        {/* Bảng danh mục trên màn hình lớn */}
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[50rem] text-left">
            <thead className="border-b border-brand-bone bg-brand-mist/70 text-[11px] font-bold tracking-wider text-brand-slate uppercase">
              <tr>
                <th className="px-5 py-3">Danh mục</th>
                <th className="px-4 py-3">Mô tả</th>
                <th className="px-4 py-3 text-center">Số ticket</th>
                <th className="px-4 py-3">Trạng thái</th>
                <th className="px-5 py-3 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-bone text-xs">
              {filtered.map((item) => (
                <tr
                  key={item.id}
                  className="transition-colors hover:bg-brand-violet/[0.03]"
                >
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <span className="flex size-9 items-center justify-center rounded-lg bg-brand-violet/10 text-xs font-bold text-brand-violet">
                        {item.icon}
                      </span>
                      <span className="font-semibold text-brand-ink">
                        {item.name}
                      </span>
                    </div>
                  </td>
                  <td className="max-w-md px-4 py-3.5 text-brand-slate">
                    {item.description}
                  </td>
                  <td className="px-4 py-3.5 text-center font-mono font-bold text-brand-ink">
                    {item.tickets}
                  </td>
                  <td className="px-4 py-3.5">
                    <button
                      type="button"
                      onClick={() => toggleCategory(item)}
                      className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                        item.active
                          ? "border border-emerald-200 bg-emerald-50 text-brand-emerald"
                          : "border border-brand-bone bg-brand-mist text-brand-slate"
                      }`}
                    >
                      {item.active ? "Đang sử dụng" : "Tạm ẩn"}
                    </button>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => openForm(item)}
                        className="flex size-8 items-center justify-center rounded-lg text-brand-slate hover:bg-brand-mist hover:text-brand-ink"
                        aria-label={`Sửa ${item.name}`}
                      >
                        <Edit3 className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeCategory(item)}
                        className="flex size-8 items-center justify-center rounded-lg text-red-600 hover:bg-red-50"
                        aria-label={`Xóa ${item.name}`}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Danh sách dạng thẻ tối ưu hiển thị trên màn hình nhỏ */}
        <ul className="divide-y divide-brand-bone md:hidden">
          {filtered.map((item) => (
            <li key={item.id} className="p-4">
              <div className="flex items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-violet/10 text-xs font-bold text-brand-violet">
                  {item.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-sm font-bold text-brand-ink">
                    {item.name}
                  </h2>
                  <p className="mt-0.5 text-xs text-brand-slate">
                    {item.description}
                  </p>
                  <div className="mt-2.5 flex items-center justify-between">
                    <span className="font-mono text-xs font-semibold text-brand-ink">
                      {item.tickets} ticket
                    </span>
                    <button
                      type="button"
                      onClick={() => openForm(item)}
                      className="text-xs font-semibold text-brand-violet"
                    >
                      Chỉnh sửa
                    </button>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export default AdminCategoriesPage;
