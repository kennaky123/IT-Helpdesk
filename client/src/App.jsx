/**
 * Component gốc (Root Component) của ứng dụng React IT Helpdesk.
 * Vai trò: Kết nối trực tiếp cây định tuyến chính (AppRoutes) vào hệ thống Provider
 * đã được khởi tạo ở tầng main.jsx.
 */
import AppRoutes from "./routes/AppRoutes.jsx";

/**
 * Render toàn bộ hệ thống route của ứng dụng theo trạng thái xác thực và vai trò.
 */
function App() {
  return <AppRoutes />;
}

export default App;
