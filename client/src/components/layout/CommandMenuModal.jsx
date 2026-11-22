/**
 * Hộp thoại tìm kiếm nhanh toàn cục (Command Menu / Command Palette).
 *
 * Props:
 * - open: Trạng thái đóng/mở của modal (quản lý bởi useUiStore trong AppLayout).
 * - onClose: Callback đóng modal khi người dùng bấm nền mờ, nút ESC hoặc chọn một kết quả.
 *
 * Vai trò trong UI Layout / Navigation:
 * - Cho phép người dùng tìm và nhảy nhanh đến các trang được phân quyền hoặc bài viết cẩm nang (Knowledge Base).
 * - Phím tắt toàn cục `Ctrl+K` / `Cmd+K` (để bật/tắt modal) và phím `Escape` (để đóng) được lắng nghe tại `AppLayout.jsx`;
 *   nút bấm kích hoạt trực quan đặt trên `Header.jsx`.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Compass, FileText, Search } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useNavigate } from "react-router-dom";
import { getNavigationForRole } from "../../constants/navigation.js";
import { KB_ARTICLES } from "../../data/itsmData.js";
import useAuth from "../../hooks/useAuth.js";

/**
 * Render modal tìm kiếm nhanh có hiệu ứng chuyển động, tự động focus ô nhập liệu và lọc kết quả theo từ khóa.
 */
function CommandMenuModal({ open, onClose }) {
  // Từ khóa tìm kiếm hiện tại trong ô input của Command Menu.
  const [query, setQuery] = useState("");
  const inputRef = useRef(null);
  const navigate = useNavigate();
  const { user } = useAuth();

  // Khi modal chuyển sang trạng thái mở, đợi frame render kế tiếp rồi tự động focus vào ô tìm kiếm.
  useEffect(() => {
    if (!open) return undefined;
    const timer = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(timer);
  }, [open]);

  // Đặt lại từ khóa tìm kiếm về rỗng trước khi gọi callback đóng modal.
  function handleClose() {
    setQuery("");
    onClose();
  }

  // Lấy danh sách trang điều hướng hợp lệ theo vai trò người dùng hiện tại.
  const navItems = useMemo(
    () => getNavigationForRole(user?.role),
    [user?.role],
  );

  // Lọc danh sách trang điều hướng theo từ khóa tìm kiếm (không phân biệt hoa thường).
  const filteredNav = useMemo(() => {
    const q = query.toLowerCase().trim();
    return navItems.filter(
      (item) => !q || item.label.toLowerCase().includes(q),
    );
  }, [navItems, query]);

  // Lọc danh sách bài viết cẩm nang tự phục vụ theo tiêu đề hoặc tên danh mục.
  const filteredKb = useMemo(() => {
    const q = query.toLowerCase().trim();
    return KB_ARTICLES.filter(
      (kb) =>
        !q ||
        kb.title.toLowerCase().includes(q) ||
        kb.category.toLowerCase().includes(q),
    );
  }, [query]);

  // Đóng modal, reset query và điều hướng đến đường dẫn đã chọn.
  function handleSelectPath(path) {
    handleClose();
    navigate(path);
  }

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/40 backdrop-blur-xs p-4"
        >
          {/* Nút lớp nền mờ: click ra ngoài hộp thoại để đóng Command Menu */}
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            onClick={handleClose}
            aria-label="Đóng thanh tìm kiếm"
          />
          <motion.div
            initial={{ opacity: 0, y: -14, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.96 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            role="dialog"
            aria-modal="true"
            aria-label="Tìm kiếm nhanh toàn cục"
            className="relative bg-white rounded-2xl border border-brand-bone w-full max-w-xl shadow-2xl overflow-hidden z-10"
          >
        <div className="p-3.5 border-b border-brand-bone flex items-center gap-3">
          <Search className="w-4 h-4 text-brand-ash ml-1.5 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Gõ để tìm nhanh trang, thiết bị mạng, IP switch, cẩm nang..."
            className="w-full text-xs text-brand-ink focus:outline-none placeholder:text-brand-ash"
          />
          <button
            type="button"
            onClick={handleClose}
            className="px-1.5 py-0.5 text-[10px] font-mono bg-brand-mist border border-brand-bone rounded text-brand-ash hover:text-brand-ink"
          >
            ESC
          </button>
        </div>

        <div className="max-h-88 overflow-y-auto p-2 divide-y divide-brand-bone/50 text-xs">
          {filteredNav.length > 0 ? (
            <div className="py-1.5">
              <div className="px-2.5 pb-1 text-[10px] font-mono font-bold uppercase tracking-wider text-brand-ash">
                Điều hướng nhanh
              </div>
              {filteredNav.map((item) => (
                <button
                  key={item.path}
                  type="button"
                  onClick={() => handleSelectPath(item.path)}
                  className="w-full p-2 hover:bg-brand-mist rounded-lg cursor-pointer flex items-center justify-between text-left transition-colors"
                >
                  <span className="font-medium text-brand-ink flex items-center gap-2">
                    <Compass className="w-3.5 h-3.5 text-brand-violet shrink-0" />
                    {item.label}
                  </span>
                  <span className="text-[10px] text-brand-ash font-mono">
                    Mở trang
                  </span>
                </button>
              ))}
            </div>
          ) : null}

          {filteredKb.length > 0 ? (
            <div className="py-1.5">
              <div className="px-2.5 pb-1 text-[10px] font-mono font-bold uppercase tracking-wider text-brand-ash">
                Cẩm nang tự phục vụ (Knowledge Base)
              </div>
              {filteredKb.map((kb) => (
                <button
                  key={kb.id}
                  type="button"
                  onClick={() =>
                    handleSelectPath(
                      user?.role === "user"
                        ? "/user/overview"
                        : user?.role === "technician"
                          ? "/technician/overview"
                          : "/admin/dashboard",
                    )
                  }
                  className="w-full p-2 hover:bg-brand-mist rounded-lg cursor-pointer flex items-center justify-between text-left transition-colors"
                >
                  <div className="min-w-0 pr-2">
                    <div className="font-medium text-brand-ink flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span className="truncate">{kb.title}</span>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-brand-mist border border-brand-bone text-brand-slate shrink-0">
                    {kb.category}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

export default CommandMenuModal;
