/*
 * ITHelpdeskUSBAgent.cs — Windows System Tray Agent giám sát an ninh USB & DLP cho hệ thống IT Helpdesk.
 *
 * Kiến trúc tổng thể:
 * - Chạy ngầm ở khay hệ thống Windows (WinForms ApplicationContext + NotifyIcon), đảm bảo chỉ 1 tiến trình
 *   duy nhất hoạt động trên mỗi phiên đăng nhập nhờ SingleInstanceMutex.
 * - Luồng nền (_workerThread) quét định kỳ các thiết bị USB/ổ đĩa/âm thanh/ngoại vi qua WMI (Win32_DiskDrive
 *   và Win32_PnPEntity), theo dõi cắm/rút theo chu kỳ 1,5 giây và gửi sự kiện HTTP POST lên Backend.
 * - Giao tiếp HTTP heartbeat & đồng bộ chính sách (GET /api/usb/agent-policies mỗi ~3 giây) để cập nhật
 *   danh sách Blacklist/Whitelist từ Admin.
 * - Khi phát hiện thiết bị thuộc chính sách "blocked", Agent phát âm thanh cảnh báo (SystemSounds.Exclamation),
 *   hiển thị thông báo khay hệ thống và vô hiệu hóa phần cứng PnP bằng pnputil.exe (yêu cầu quyền Admin).
 * - Khi chạy với quyền Administrator, Agent tự sao chép cài đặt vào %ProgramData%\ITHelpdeskUSBAgent và
 *   đăng ký Task Scheduler tự động khởi chạy cùng Windows ở mức quyền cao nhất (/rl highest).
 */
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Management;
using System.Media;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Security.Principal;
using System.Text;
using System.Threading;
using System.Windows.Forms;
using System.Web.Script.Serialization;

namespace ITHelpdeskUSBAgent
{
    /// <summary>
    /// Bản ghi lưu trữ thông tin chi tiết của một thiết bị USB/PnP phát hiện trên máy trạm.
    /// </summary>
    public class UsbDeviceRecord
    {
        public string DeviceId { get; set; }
        public string DeviceName { get; set; }
        public string Vendor { get; set; }
        public string SerialNumber { get; set; }
        public string DeviceType { get; set; }
        public string DriveLetter { get; set; }
        public string VolumeName { get; set; }
    }

    /// <summary>
    /// Mô hình cấu hình JSON (agent-config.json) lưu địa chỉ máy chủ Backend IT Helpdesk.
    /// </summary>
    public class AgentConfig
    {
        public string serverUrl { get; set; }
    }

    /// <summary>
    /// Điểm khởi chạy chính của tiến trình Windows Forms Tray Agent.
    /// </summary>
    static class Program
    {
        // Mutex đặt tên trong namespace Local\ để ngăn chạy trùng lặp nhiều bản Agent trong cùng phiên người dùng
        private static Mutex SingleInstanceMutex;

        [STAThread]
        static void Main(string[] args)
        {
            bool createdNew;
            // Khởi tạo và chiếm giữ Mutex; nếu createdNew == false nghĩa là đã có một bản Agent đang chạy
            SingleInstanceMutex = new Mutex(true, "Local\\ITHelpdeskUSBAgent_Tray_v2", out createdNew);
            if (!createdNew)
            {
                return;
            }

            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            try
            {
                // Chạy vòng lặp thông điệp WinForms với ApplicationContext tùy biến (không mở Form chính lúc khởi động)
                Application.Run(new TrayAgentContext(args));
            }
            finally
            {
                // Giải phóng Mutex an toàn khi Agent thoát hoàn toàn
                try { SingleInstanceMutex.ReleaseMutex(); } catch { }
                SingleInstanceMutex.Dispose();
            }
        }
    }

    /// <summary>
    /// Ngữ cảnh chạy ngầm ở System Tray: quản lý giao diện NotifyIcon, cửa sổ Log, luồng quét WMI
    /// và đồng bộ chính sách/heartbeat với máy chủ IT Helpdesk.
    /// </summary>
    public class TrayAgentContext : ApplicationContext
    {
        // Tên tác vụ trong Windows Task Scheduler và đường dẫn cài đặt cố định tại C:\ProgramData\ITHelpdeskUSBAgent
        private const string TaskName = "ITHelpdeskUSBAgent";
        private static readonly string InstallDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
            "ITHelpdeskUSBAgent"
        );
        private static readonly string InstalledExePath = Path.Combine(InstallDir, "ITHelpdeskUSBAgent.exe");
        private static readonly string ConfigFilePath = Path.Combine(InstallDir, "agent-config.json");
        private static readonly string LocalConfigFilePath = Path.Combine(
            AppDomain.CurrentDomain.BaseDirectory,
            "agent-config.json"
        );

        // Thông tin định danh máy trạm và trạng thái quyền thực thi hiện tại
        private readonly string _hostname = Environment.MachineName;
        private readonly string _osUsername = Environment.UserName;
        private readonly string _localIp;
        private readonly bool _isAdmin;
        private readonly JavaScriptSerializer _jsonSerializer = new JavaScriptSerializer();

        // Bộ nhớ đệm các thiết bị USB đang cắm và tập thiết bị đã bị Agent ngắt phần cứng (tránh gọi pnputil lặp lại)
        private readonly Dictionary<string, UsbDeviceRecord> _connectedDevices =
            new Dictionary<string, UsbDeviceRecord>(StringComparer.OrdinalIgnoreCase);
        private readonly HashSet<string> _blockedByAgent =
            new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        // Khóa đồng bộ truy cập đa luồng giữa luồng quét WMI, đồng bộ thủ công và luồng nhận policy
        private readonly object _syncLock = new object();
        private readonly List<string> _logBuffer = new List<string>();
        // SynchronizationContext dùng để đẩy các thao tác cập nhật UI (Menu, Balloon, LogBox) về đúng luồng WinForms
        private readonly SynchronizationContext _uiContext;

        private string _serverBaseUrl = "http://192.168.1.6:5000";
        private bool _isConnectedToServer = false;
        private volatile bool _isRunning = true;
        private int _simulatedCounter = 1;

        // Các thành phần UI của Tray Agent
        private NotifyIcon _trayIcon;
        private ToolStripMenuItem _statusMenuItem;
        private ToolStripMenuItem _startupMenuItem;
        private Form _logForm;
        private TextBox _logTextBox;
        private Thread _workerThread;

        /// <summary>
        /// Khởi tạo ngữ cảnh Tray Agent, dựng biểu tượng khay hệ thống và khởi chạy luồng nền giám sát.
        /// </summary>
        public TrayAgentContext(string[] args)
        {
            _uiContext = SynchronizationContext.Current ?? new WindowsFormsSynchronizationContext();
            _localIp = DetectLocalIpv4();
            _isAdmin = IsRunAsAdministrator();

            BuildTrayIcon();
            Log("Khởi động IT Helpdesk USB Security & DLP Agent v2.0 (Chạy ngầm System Tray)");
            Log(string.Format("Máy trạm: {0} | User: {1} | IP: {2} | Quyền Admin: {3}",
                _hostname, _osUsername, _localIp, _isAdmin ? "CÓ" : "KHÔNG"));

            // Khởi chạy luồng nền thực hiện cài đặt, dò tìm server, quét WMI và đồng bộ policy
            _workerThread = new Thread(() => RunBackgroundLoop(args));
            _workerThread.IsBackground = true;
            _workerThread.Start();
        }

        /// <summary>
        /// Tạo biểu tượng System Tray (NotifyIcon) cùng menu chuột phải cho quản trị viên/người dùng thao tác nhanh.
        /// </summary>
        private void BuildTrayIcon()
        {
            ContextMenuStrip menu = new ContextMenuStrip();

            _statusMenuItem = new ToolStripMenuItem("● Đang kết nối máy chủ...");
            _statusMenuItem.Enabled = false;
            menu.Items.Add(_statusMenuItem);

            menu.Items.Add(new ToolStripSeparator());

            ToolStripMenuItem syncItem = new ToolStripMenuItem("Đồng bộ thiết bị USB ngay");
            syncItem.Click += (s, e) => ThreadPool.QueueUserWorkItem(_ => SyncAllConnectedUsbToServer(true));
            menu.Items.Add(syncItem);

            ToolStripMenuItem logItem = new ToolStripMenuItem("Xem Nhật ký hoạt động (Log)...");
            logItem.Click += (s, e) => ShowLogWindow();
            menu.Items.Add(logItem);

            ToolStripMenuItem changeServerItem = new ToolStripMenuItem("Đổi địa chỉ IP Server...");
            changeServerItem.Click += (s, e) => PromptChangeServerUrl();
            menu.Items.Add(changeServerItem);

            ToolStripMenuItem simItem = new ToolStripMenuItem("Giả lập cắm USB (Test)");
            simItem.Click += (s, e) => ThreadPool.QueueUserWorkItem(_ => TriggerSimulatedUsbEvent());
            menu.Items.Add(simItem);

            menu.Items.Add(new ToolStripSeparator());

            _startupMenuItem = new ToolStripMenuItem("Tự động chạy cùng Windows (Quyền Admin)");
            _startupMenuItem.CheckOnClick = false;
            _startupMenuItem.Checked = IsStartupTaskRegistered();
            _startupMenuItem.Click += (s, e) => ToggleStartupTask();
            menu.Items.Add(_startupMenuItem);

            menu.Items.Add(new ToolStripSeparator());

            ToolStripMenuItem exitItem = new ToolStripMenuItem("Thoát Agent");
            exitItem.Click += (s, e) => ExitAgent();
            menu.Items.Add(exitItem);

            _trayIcon = new NotifyIcon();
            _trayIcon.Icon = CreateShieldIcon();
            _trayIcon.Text = "IT Helpdesk USB Security Agent";
            _trayIcon.ContextMenuStrip = menu;
            _trayIcon.Visible = true;
            _trayIcon.DoubleClick += (s, e) => ShowLogWindow();
        }

        /// <summary>
        /// Vẽ icon chiếc khiên màu tím (#6647f0) kèm biểu tượng USB màu trắng bằng GDI+ mà không cần file .ico ngoài.
        /// </summary>
        private Icon CreateShieldIcon()
        {
            Bitmap bmp = new Bitmap(32, 32);
            using (Graphics g = Graphics.FromImage(bmp))
            {
                g.SmoothingMode = SmoothingMode.AntiAlias;
                g.Clear(Color.Transparent);

                // Vẽ hình đa giác chiếc khiên và viền trắng
                using (GraphicsPath path = new GraphicsPath())
                {
                    path.AddPolygon(new Point[]
                    {
                        new Point(16, 2),
                        new Point(29, 7),
                        new Point(27, 19),
                        new Point(16, 30),
                        new Point(5, 19),
                        new Point(3, 7)
                    });
                    using (SolidBrush bg = new SolidBrush(Color.FromArgb(102, 71, 240)))
                    {
                        g.FillPath(bg, path);
                    }
                    using (Pen border = new Pen(Color.White, 1.5f))
                    {
                        g.DrawPath(border, path);
                    }
                }

                // Draw crisp white USB trident symbol inside shield (Vẽ biểu tượng đinh ba USB bên trong khiên)
                using (Pen whitePen = new Pen(Color.White, 2f))
                {
                    whitePen.StartCap = LineCap.Round;
                    whitePen.EndCap = LineCap.Round;
                    g.DrawLine(whitePen, 16, 9, 16, 22);
                    g.DrawLine(whitePen, 16, 17, 11, 14);
                    g.DrawLine(whitePen, 16, 15, 21, 12);
                }
                using (SolidBrush whiteBrush = new SolidBrush(Color.White))
                {
                    g.FillEllipse(whiteBrush, 13.5f, 20f, 5f, 5f);
                    g.FillEllipse(whiteBrush, 9.5f, 11.5f, 3.5f, 3.5f);
                    g.FillRectangle(whiteBrush, 19.5f, 9.5f, 3.5f, 3.5f);
                }
            }
            IntPtr hIcon = bmp.GetHicon();
            return Icon.FromHandle(hIcon);
        }

        /// <summary>
        /// Vòng lặp chính chạy trên luồng nền:
        /// 1. Tự cài đặt vào ProgramData & đăng ký Task Scheduler (nếu có quyền Admin).
        /// 2. Khởi tạo/dò tìm kết nối tới Backend Server.
        /// 3. Quét thiết bị USB ban đầu và tải policy chặn hiện hành.
        /// 4. Lặp vô hạn mỗi 1,5 giây: theo dõi biến động cắm/rút USB qua WMI và mỗi ~3 giây gọi heartbeat đồng bộ policy.
        /// </summary>
        private void RunBackgroundLoop(string[] args)
        {
            if (_isAdmin)
            {
                EnsureAutoInstallAndStartupTask();
            }
            else
            {
                Log("[!] Cảnh báo: Agent chưa chạy bằng quyền Administrator — không thể chặn cứng phần cứng USB.");
            }

            InitializeServerConnection(args);
            ScanAndSyncInitialDevices();
            SyncPoliciesFromServer();

            ShowBalloon(
                "IT Helpdesk USB Security Agent",
                _isConnectedToServer
                    ? string.Format("Đang bảo vệ ngầm (Server: {0}). Chế độ chặn phần cứng: {1}.",
                        _serverBaseUrl, _isAdmin ? "BẬT" : "Cần quyền Admin")
                    : "Đang chạy ngầm ở System Tray. Chưa kết nối được tới máy chủ Server.",
                _isConnectedToServer ? ToolTipIcon.Info : ToolTipIcon.Warning
            );

            int cycle = 0;
            while (_isRunning)
            {
                try
                {
                    // Kiểm tra thiết bị USB cắm mới hoặc vừa rút ra bằng WMI snapshot
                    PollUsbChanges();

                    // Đồng bộ chính sách chặn/mở khóa từ Server mỗi ~3 giây (đồng thời đóng vai trò heartbeat)
                    if (cycle % 2 == 0)
                    {
                        SyncPoliciesFromServer();
                    }
                    cycle++;
                }
                catch (Exception ex)
                {
                    Log("[Debug] Lỗi chu kỳ quét: " + ex.Message);
                }

                Thread.Sleep(1500);
            }
        }

        /// <summary>
        /// Tự động sao chép file thực thi & agent-config.json vào C:\ProgramData\ITHelpdeskUSBAgent
        /// và đăng ký tác vụ Task Scheduler tự chạy khi người dùng đăng nhập với quyền Admin cao nhất.
        /// </summary>
        private void EnsureAutoInstallAndStartupTask()
        {
            try
            {
                if (!Directory.Exists(InstallDir))
                {
                    Directory.CreateDirectory(InstallDir);
                }

                string currentExe = Process.GetCurrentProcess().MainModule.FileName;
                if (!string.Equals(currentExe, InstalledExePath, StringComparison.OrdinalIgnoreCase))
                {
                    try
                    {
                        File.Copy(currentExe, InstalledExePath, true);
                        Log("[✓] Đã sao chép bản cài đặt vào: " + InstalledExePath);
                    }
                    catch (Exception copyEx)
                    {
                        Log("[!] Không thể cập nhật file cài đặt (có thể đang chạy): " + copyEx.Message);
                    }
                }

                // Sao chép file cấu hình đi kèm (nếu có) vào thư mục ProgramData lần đầu
                if (File.Exists(LocalConfigFilePath) && !File.Exists(ConfigFilePath))
                {
                    try { File.Copy(LocalConfigFilePath, ConfigFilePath, true); } catch { }
                }

                string targetPath = File.Exists(InstalledExePath) ? InstalledExePath : currentExe;
                if (RegisterStartupTask(targetPath))
                {
                    Log("[✓] Đã đăng ký tự khởi động cùng Windows với quyền Administrator (Task Scheduler).");
                    UpdateUi(() =>
                    {
                        if (_startupMenuItem != null) _startupMenuItem.Checked = true;
                    });
                }
            }
            catch (Exception ex)
            {
                Log("[!] Lỗi thiết lập tự khởi động: " + ex.Message);
            }
        }

        /// <summary>
        /// Kiểm tra tác vụ tự khởi động đã tồn tại trong Windows Task Scheduler chưa.
        /// </summary>
        private bool IsStartupTaskRegistered()
        {
            string output;
            int code = RunProcess("schtasks.exe", string.Format("/query /tn \"{0}\"", TaskName), out output);
            return code == 0;
        }

        /// <summary>
        /// Đăng ký tác vụ Task Scheduler (`/sc onlogon /rl highest /f`) để chạy Agent với quyền Admin khi logon.
        /// </summary>
        private bool RegisterStartupTask(string exePath)
        {
            string args = string.Format(
                "/create /tn \"{0}\" /tr \"\\\"{1}\\\"\" /sc onlogon /rl highest /f",
                TaskName,
                exePath
            );
            string output;
            int code = RunProcess("schtasks.exe", args, out output);
            if (code != 0)
            {
                Log("[!] Đăng ký Task Scheduler thất bại: " + output);
                return false;
            }
            return true;
        }

        /// <summary>
        /// Xóa tác vụ tự khởi động khỏi Windows Task Scheduler.
        /// </summary>
        private bool UnregisterStartupTask()
        {
            string output;
            int code = RunProcess("schtasks.exe", string.Format("/delete /tn \"{0}\" /f", TaskName), out output);
            return code == 0;
        }

        /// <summary>
        /// Bật hoặc tắt chế độ tự động khởi động cùng Windows từ menu khay hệ thống (yêu cầu quyền Admin).
        /// </summary>
        private void ToggleStartupTask()
        {
            if (!_isAdmin)
            {
                MessageBox.Show(
                    "Vui lòng chạy ITHelpdeskUSBAgent.exe bằng quyền Administrator để bật/tắt tự khởi động.",
                    "Cần quyền Administrator",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Warning
                );
                return;
            }

            if (IsStartupTaskRegistered())
            {
                if (UnregisterStartupTask())
                {
                    _startupMenuItem.Checked = false;
                    Log("[*] Đã tắt tự động khởi động cùng Windows.");
                    ShowBalloon("IT Helpdesk USB Agent", "Đã tắt tự động chạy cùng Windows.", ToolTipIcon.Info);
                }
            }
            else
            {
                string currentExe = Process.GetCurrentProcess().MainModule.FileName;
                string targetPath = File.Exists(InstalledExePath) ? InstalledExePath : currentExe;
                if (RegisterStartupTask(targetPath))
                {
                    _startupMenuItem.Checked = true;
                    Log("[✓] Đã bật tự động khởi động cùng Windows với quyền Admin.");
                    ShowBalloon("IT Helpdesk USB Agent", "Đã bật tự động chạy ngầm với quyền Admin khi mở máy.", ToolTipIcon.Info);
                }
            }
        }

        /// <summary>
        /// Vô hiệu hóa hoặc kích hoạt lại thiết bị PnP cấp phần cứng Windows theo PNPDeviceID.
        /// Cơ chế: Gọi trực tiếp `pnputil.exe /disable-device` hoặc `/enable-device` (tương đương
        /// `Disable-PnpDevice`/`Enable-PnpDevice` trong PowerShell nhưng nhẹ hơn và chạy trực tiếp từ System32).
        /// Bỏ qua các thiết bị test giả lập (`VEN_SIMULATED`) và yêu cầu quyền Administrator.
        /// </summary>
        private bool SetDeviceEnabled(string pnpDeviceId, bool enable)
        {
            if (string.IsNullOrWhiteSpace(pnpDeviceId)) return false;
            if (pnpDeviceId.IndexOf("VEN_SIMULATED", StringComparison.OrdinalIgnoreCase) >= 0)
            {
                Log(string.Format("[*] Bỏ qua pnputil cho thiết bị giả lập: {0}", pnpDeviceId));
                return true;
            }

            if (!_isAdmin)
            {
                Log("[!] Không thể " + (enable ? "mở khóa" : "chặn") + " phần cứng vì Agent chưa có quyền Admin.");
                return false;
            }

            string action = enable ? "/enable-device" : "/disable-device";
            string pnputilPath = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.System),
                "pnputil.exe"
            );
            if (!File.Exists(pnputilPath)) pnputilPath = "pnputil.exe";

            string output;
            int exitCode = RunProcess(pnputilPath, string.Format("{0} \"{1}\"", action, pnpDeviceId), out output);
            Log(string.Format("[PnP] {0} {1} => exit={2} | {3}",
                action, pnpDeviceId, exitCode, (output ?? "").Replace("\r", " ").Replace("\n", " ").Trim()));
            return exitCode == 0;
        }

        /// <summary>
        /// Thực thi lệnh hệ thống (như schtasks.exe, pnputil.exe) ở chế độ chạy ngầm không mở cửa sổ console,
        /// đọc toàn bộ stdout/stderr với timeout tối đa 10 giây.
        /// </summary>
        private int RunProcess(string fileName, string arguments, out string output)
        {
            output = "";
            try
            {
                ProcessStartInfo psi = new ProcessStartInfo
                {
                    FileName = fileName,
                    Arguments = arguments,
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    StandardOutputEncoding = Encoding.UTF8,
                    StandardErrorEncoding = Encoding.UTF8
                };

                using (Process proc = Process.Start(psi))
                {
                    string stdout = proc.StandardOutput.ReadToEnd();
                    string stderr = proc.StandardError.ReadToEnd();
                    proc.WaitForExit(10000);
                    output = (stdout + " " + stderr).Trim();
                    return proc.ExitCode;
                }
            }
            catch (Exception ex)
            {
                output = ex.Message;
                return -1;
            }
        }

        /// <summary>
        /// Đồng bộ danh sách chính sách USB từ Backend (GET /api/usb/agent-policies) và đóng vai trò
        /// heartbeat kiểm tra kết nối định kỳ với máy chủ.
        /// - Nếu thiết bị đang cắm nằm trong danh sách blocked: vô hiệu hóa phần cứng qua pnputil,
        ///   phát âm thanh cảnh báo (SystemSounds.Exclamation) và hiển thị Balloon Error.
        /// - Nếu thiết bị từng bị Agent chặn nay được Admin gỡ chặn/duyệt: tự động kích hoạt lại phần cứng.
        /// </summary>
        private void SyncPoliciesFromServer()
        {
            if (string.IsNullOrEmpty(_serverBaseUrl)) return;

            try
            {
                HttpWebRequest req = (HttpWebRequest)WebRequest.Create(_serverBaseUrl + "/api/usb/agent-policies");
                req.Method = "GET";
                req.Timeout = 4000;

                using (HttpWebResponse resp = (HttpWebResponse)req.GetResponse())
                using (StreamReader reader = new StreamReader(resp.GetResponseStream(), Encoding.UTF8))
                {
                    string body = reader.ReadToEnd();
                    var parsed = _jsonSerializer.DeserializeObject(body) as Dictionary<string, object>;
                    if (parsed == null || !parsed.ContainsKey("data")) return;

                    var dataObj = parsed["data"] as Dictionary<string, object>;
                    if (dataObj == null || !dataObj.ContainsKey("policies")) return;

                    var policies = dataObj["policies"] as object[];
                    if (policies == null) return;

                    // Tập các PNPDeviceID đang bị Admin chặn trên máy chủ và bảng tra tên thiết bị
                    HashSet<string> serverBlockedIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                    Dictionary<string, string> policyNames = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

                    foreach (object item in policies)
                    {
                        var dict = item as Dictionary<string, object>;
                        if (dict == null) continue;
                        string devId = dict.ContainsKey("deviceId") && dict["deviceId"] != null
                            ? dict["deviceId"].ToString().Trim()
                            : "";
                        string status = dict.ContainsKey("status") && dict["status"] != null
                            ? dict["status"].ToString().Trim().ToLowerInvariant()
                            : "unverified";
                        string devName = dict.ContainsKey("deviceName") && dict["deviceName"] != null
                            ? dict["deviceName"].ToString().Trim()
                            : devId;

                        if (string.IsNullOrEmpty(devId)) continue;
                        policyNames[devId] = devName;

                        if (status == "blocked")
                        {
                            serverBlockedIds.Add(devId);
                        }
                    }

                    lock (_syncLock)
                    {
                        // 1. Chặn ngay các thiết bị đang cắm trên máy này nằm trong Blacklist
                        foreach (string blockedId in serverBlockedIds)
                        {
                            if (_connectedDevices.ContainsKey(blockedId) && !_blockedByAgent.Contains(blockedId))
                            {
                                string devName = _connectedDevices[blockedId].DeviceName ?? blockedId;
                                bool disabled = SetDeviceEnabled(blockedId, false);
                                _blockedByAgent.Add(blockedId);
                                // Phát âm thanh cảnh báo hệ thống Windows khi phát hiện USB bị chặn
                                try { SystemSounds.Exclamation.Play(); } catch { }
                                Log(string.Format("🚨 [CHẶN PHẦN CỨNG] {0} ({1}) — Trạng thái: {2}",
                                    devName, blockedId, disabled ? "ĐÃ NGẮT KẾT NỐI" : "Cần quyền Admin"));
                                ShowBalloon(
                                    "🚨 Đã chặn thiết bị USB (Blacklist)",
                                    disabled
                                        ? string.Format("Thiết bị \"{0}\" đã bị vô hiệu hóa theo chính sách bảo mật IT.", devName)
                                        : string.Format("Phát hiện thiết bị bị chặn \"{0}\".", devName),
                                    ToolTipIcon.Error
                                );
                            }
                        }

                        // 2. Mở khóa lại các thiết bị đã bị Agent chặn trước đó nhưng nay Admin đã Duyệt / Bỏ chặn
                        List<string> toUnblock = new List<string>();
                        foreach (string currentlyBlocked in _blockedByAgent)
                        {
                            if (!serverBlockedIds.Contains(currentlyBlocked))
                            {
                                toUnblock.Add(currentlyBlocked);
                            }
                        }

                        foreach (string unblockId in toUnblock)
                        {
                            string devName = _connectedDevices.ContainsKey(unblockId)
                                ? _connectedDevices[unblockId].DeviceName
                                : (policyNames.ContainsKey(unblockId) ? policyNames[unblockId] : unblockId);
                            bool enabled = SetDeviceEnabled(unblockId, true);
                            _blockedByAgent.Remove(unblockId);
                            Log(string.Format("✅ [MỞ KHÓA PHẦN CỨNG] {0} ({1}) — Trạng thái: {2}",
                                devName, unblockId, enabled ? "ĐÃ KÍCH HOẠT LẠI" : "Không thể mở"));
                            ShowBalloon(
                                "✅ Đã mở khóa thiết bị USB",
                                string.Format("Thiết bị \"{0}\" đã được IT phê duyệt và kích hoạt lại.", devName),
                                ToolTipIcon.Info
                            );
                        }
                    }

                    // Đánh dấu kết nối máy chủ khỏe mạnh (heartbeat thành công)
                    if (!_isConnectedToServer)
                    {
                        _isConnectedToServer = true;
                        UpdateStatusMenu();
                    }
                }
            }
            catch
            {
                // Khi gọi API chính sách thất bại, cập nhật trạng thái mất kết nối trên khay hệ thống
                if (_isConnectedToServer)
                {
                    _isConnectedToServer = false;
                    UpdateStatusMenu();
                }
            }
        }

        /// <summary>
        /// Quét toàn bộ thiết bị USB hiện có ngay lúc Agent khởi động và báo cáo các thiết bị lưu trữ (storage).
        /// </summary>
        private void ScanAndSyncInitialDevices()
        {
            Dictionary<string, UsbDeviceRecord> initialDevices = ScanCurrentUsbDevices();
            lock (_syncLock)
            {
                foreach (var kvp in initialDevices)
                {
                    _connectedDevices[kvp.Key] = kvp.Value;
                }
            }
            Log(string.Format("[✓] Đã ghi nhận {0} thiết bị USB hiện có trên máy.", initialDevices.Count));

            // Chỉ tự động đẩy sự kiện khởi tạo với các thiết bị lưu trữ ngoài (USB flash/ổ cứng di động)
            foreach (var kvp in initialDevices)
            {
                if (kvp.Value.DeviceType == "storage")
                {
                    SendUsbEventToServer(kvp.Value, "connected");
                }
            }
        }

        /// <summary>
        /// Cơ chế theo dõi biến động PnP/USB bằng cách đối chiếu snapshot WMI hiện tại với cache `_connectedDevices`:
        /// - Thiết bị mới xuất hiện -> gửi sự kiện "connected" lên Backend.
        /// - Thiết bị không còn trong WMI -> xóa khỏi cache/_blockedByAgent và gửi sự kiện "disconnected".
        /// </summary>
        private void PollUsbChanges()
        {
            Dictionary<string, UsbDeviceRecord> current = ScanCurrentUsbDevices();
            List<UsbDeviceRecord> newlyConnected = new List<UsbDeviceRecord>();
            List<UsbDeviceRecord> newlyRemoved = new List<UsbDeviceRecord>();

            lock (_syncLock)
            {
                // Tìm các thiết bị mới được cắm vào
                foreach (var kvp in current)
                {
                    if (!_connectedDevices.ContainsKey(kvp.Key))
                    {
                        _connectedDevices[kvp.Key] = kvp.Value;
                        newlyConnected.Add(kvp.Value);
                    }
                }

                // Tìm các thiết bị đã bị rút ra khỏi máy
                List<string> removedKeys = new List<string>();
                foreach (var kvp in _connectedDevices)
                {
                    if (!current.ContainsKey(kvp.Key))
                    {
                        removedKeys.Add(kvp.Key);
                    }
                }

                foreach (string key in removedKeys)
                {
                    newlyRemoved.Add(_connectedDevices[key]);
                    _connectedDevices.Remove(key);
                    _blockedByAgent.Remove(key);
                }
            }

            foreach (UsbDeviceRecord dev in newlyConnected)
            {
                Log(string.Format("🔌 Phát hiện cắm mới: {0} ({1})", dev.DeviceName, dev.DeviceId));
                SendUsbEventToServer(dev, "connected");
            }

            foreach (UsbDeviceRecord dev in newlyRemoved)
            {
                Log(string.Format("📤 Phát hiện rút thiết bị: {0}", dev.DeviceName));
                SendUsbEventToServer(dev, "disconnected");
            }
        }

        /// <summary>
        /// Quét lại toàn bộ thiết bị USB hiện tại và đẩy trạng thái lên máy chủ theo yêu cầu thủ công từ menu Tray.
        /// </summary>
        private void SyncAllConnectedUsbToServer(bool showNotification)
        {
            Dictionary<string, UsbDeviceRecord> current = ScanCurrentUsbDevices();
            lock (_syncLock)
            {
                _connectedDevices.Clear();
                foreach (var kvp in current)
                {
                    _connectedDevices[kvp.Key] = kvp.Value;
                }
            }

            int count = 0;
            foreach (var kvp in current)
            {
                SendUsbEventToServer(kvp.Value, "connected");
                count++;
            }

            SyncPoliciesFromServer();
            Log(string.Format("[✓] Đã đồng bộ {0} thiết bị USB lên Server.", count));
            if (showNotification)
            {
                ShowBalloon(
                    "Đồng bộ thiết bị USB",
                    string.Format("Đã gửi thông tin {0} thiết bị USB lên máy chủ IT Helpdesk.", count),
                    ToolTipIcon.Info
                );
            }
        }

        /// <summary>
        /// Tạo sự kiện cắm USB giả lập (VEN_SIMULATED) để kiểm thử luồng cảnh báo realtime trên Web Dashboard
        /// mà không cần cắm thiết bị vật lý.
        /// </summary>
        private void TriggerSimulatedUsbEvent()
        {
            string[] sampleNames = new string[]
            {
                "Kingston DataTraveler Exodia 64GB",
                "SanDisk Extreme Go USB 3.2 128GB",
                "Samsung BAR Plus USB Flash Drive 256GB",
                "Unknown USB Mass Storage (Unencrypted DLP Alert)"
            };
            string[] sampleVendors = new string[]
            {
                "Kingston Technology (VID_0951)",
                "SanDisk Corp (VID_0781)",
                "Samsung Electronics (VID_090C)",
                "Generic USB Vendor (VID_FFFF)"
            };

            int idx = (_simulatedCounter - 1) % sampleNames.Length;
            string serial = "SIM" + DateTime.Now.ToString("MMddHHmmss") + _simulatedCounter;
            _simulatedCounter++;

            UsbDeviceRecord sim = new UsbDeviceRecord
            {
                DeviceId = "USBSTOR\\DISK&VEN_SIMULATED&PROD_FLASH\\" + serial,
                DeviceName = sampleNames[idx],
                Vendor = sampleVendors[idx],
                SerialNumber = serial,
                DeviceType = "storage",
                DriveLetter = "F:",
                VolumeName = "USB_NHANVIEN (64.0 GB)"
            };

            Log("🧪 [Test] Giả lập cắm USB: " + sim.DeviceName);
            SendUsbEventToServer(sim, "connected");
        }

        /// <summary>
        /// Gửi thông tin sự kiện cắm/rút thiết bị USB cùng ngữ cảnh máy trạm lên endpoint POST /api/usb/agent-event.
        /// Nếu phản hồi từ Backend trả về `policyStatus == "blocked"` khi mới cắm, Agent lập tức ngắt cứng
        /// thiết bị bằng pnputil, phát âm thanh cảnh báo và bật thông báo khay hệ thống.
        /// </summary>
        private void SendUsbEventToServer(UsbDeviceRecord device, string eventType)
        {
            try
            {
                var payload = new Dictionary<string, object>
                {
                    { "deviceId", device.DeviceId },
                    { "deviceName", device.DeviceName },
                    { "vendor", device.Vendor ?? "Unknown USB Vendor" },
                    { "serialNumber", device.SerialNumber },
                    { "deviceType", device.DeviceType ?? "other_usb" },
                    { "driveLetter", device.DriveLetter },
                    { "volumeName", device.VolumeName },
                    { "eventType", eventType },
                    { "hostname", _hostname },
                    { "osUsername", _osUsername },
                    { "ipAddress", _localIp },
                    { "agentVersion", "2.0.0-tray-win64" }
                };

                string jsonBody = _jsonSerializer.Serialize(payload);
                byte[] bytes = Encoding.UTF8.GetBytes(jsonBody);

                HttpWebRequest req = (HttpWebRequest)WebRequest.Create(_serverBaseUrl + "/api/usb/agent-event");
                req.Method = "POST";
                req.ContentType = "application/json; charset=utf-8";
                req.ContentLength = bytes.Length;
                req.Timeout = 5000;

                using (Stream reqStream = req.GetRequestStream())
                {
                    reqStream.Write(bytes, 0, bytes.Length);
                }

                using (HttpWebResponse resp = (HttpWebResponse)req.GetResponse())
                using (StreamReader reader = new StreamReader(resp.GetResponseStream(), Encoding.UTF8))
                {
                    string responseText = reader.ReadToEnd();
                    var parsed = _jsonSerializer.DeserializeObject(responseText) as Dictionary<string, object>;
                    string policyStatus = "unverified";
                    string message = "Đã gửi thông báo lên Server.";

                    if (parsed != null && parsed.ContainsKey("data"))
                    {
                        var dataObj = parsed["data"] as Dictionary<string, object>;
                        if (dataObj != null)
                        {
                            if (dataObj.ContainsKey("policyStatus") && dataObj["policyStatus"] != null)
                                policyStatus = dataObj["policyStatus"].ToString();
                            if (dataObj.ContainsKey("policyMessage") && dataObj["policyMessage"] != null)
                                message = dataObj["policyMessage"].ToString();
                        }
                    }

                    // Thực thi chặn cứng ngay tức thì nếu Backend đánh dấu thiết bị thuộc Blacklist
                    if (policyStatus == "blocked" && eventType == "connected")
                    {
                        bool disabled = false;
                        lock (_syncLock)
                        {
                            disabled = SetDeviceEnabled(device.DeviceId, false);
                            _blockedByAgent.Add(device.DeviceId);
                        }
                        try { SystemSounds.Exclamation.Play(); } catch { }
                        Log("🚨 [BỊ CHẶN]: " + device.DeviceName + " — " + (disabled ? "Đã ngắt phần cứng" : message));
                        ShowBalloon(
                            "🚨 Thiết bị USB bị chặn (Blacklist)",
                            disabled
                                ? string.Format("Đã ngắt thiết bị \"{0}\" theo chính sách bảo mật công ty.", device.DeviceName)
                                : message,
                            ToolTipIcon.Error
                        );
                    }
                    else if (policyStatus == "trusted")
                    {
                        Log("✅ [HỢP LỆ]: " + device.DeviceName);
                    }
                    else if (eventType == "connected")
                    {
                        Log("⚠️ [CHƯA XÁC MINH]: " + device.DeviceName);
                    }

                    if (!_isConnectedToServer)
                    {
                        _isConnectedToServer = true;
                        UpdateStatusMenu();
                    }
                }
            }
            catch (Exception ex)
            {
                Log(string.Format("[x] Không thể gửi sự kiện tới {0}: {1}", _serverBaseUrl, ex.Message));
            }
        }

        /// <summary>
        /// Chuẩn hóa chuỗi IP/URL người dùng nhập (tự thêm http://, mặc định cổng :5000 và bỏ hậu tố /api).
        /// </summary>
        private string NormalizeServerUrl(string raw)
        {
            if (string.IsNullOrWhiteSpace(raw)) return null;
            string s = raw.Trim().TrimEnd('/');
            if (!s.StartsWith("http://", StringComparison.OrdinalIgnoreCase) &&
                !s.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
            {
                s = s.Contains(":") ? ("http://" + s) : ("http://" + s + ":5000");
            }
            if (s.EndsWith("/api", StringComparison.OrdinalIgnoreCase))
            {
                s = s.Substring(0, s.Length - 4);
            }
            return s;
        }

        /// <summary>
        /// Khởi tạo kết nối máy chủ theo thứ tự ưu tiên:
        /// 1. Tham số dòng lệnh (`args[0]`).
        /// 2. Cấu hình đã lưu trong `agent-config.json` (ProgramData rồi tới thư mục chạy).
        /// 3. Danh sách IP mặc định (localhost và IP LAN quen thuộc).
        /// 4. Tự động quét toàn bộ dải mạng `/24` nội bộ nếu các ứng viên trên đều thất bại.
        /// </summary>
        private void InitializeServerConnection(string[] args)
        {
            List<string> candidates = new List<string>();
            if (args != null && args.Length > 0 && !string.IsNullOrWhiteSpace(args[0]))
            {
                candidates.Add(NormalizeServerUrl(args[0]));
            }

            foreach (string cfgPath in new string[] { ConfigFilePath, LocalConfigFilePath })
            {
                if (File.Exists(cfgPath))
                {
                    try
                    {
                        string json = File.ReadAllText(cfgPath, Encoding.UTF8);
                        AgentConfig cfg = _jsonSerializer.Deserialize<AgentConfig>(json);
                        if (cfg != null && !string.IsNullOrWhiteSpace(cfg.serverUrl))
                        {
                            string normalized = NormalizeServerUrl(cfg.serverUrl);
                            if (!candidates.Contains(normalized)) candidates.Add(normalized);
                        }
                    }
                    catch { }
                }
            }

            string[] defaults = new string[]
            {
                "http://127.0.0.1:5000",
                "http://192.168.1.6:5000",
                "http://192.168.1.16:5000"
            };
            foreach (string d in defaults)
            {
                if (!candidates.Contains(d)) candidates.Add(d);
            }

            foreach (string candidate in candidates)
            {
                if (string.IsNullOrEmpty(candidate)) continue;
                if (PingServer(candidate))
                {
                    _serverBaseUrl = candidate;
                    _isConnectedToServer = true;
                    SaveConfig(_serverBaseUrl);
                    Log("[✓] Kết nối Server thành công: " + _serverBaseUrl);
                    UpdateStatusMenu();
                    return;
                }
            }

            Log("[*] Đang tự động dò tìm Server trong mạng LAN...");
            string discoveredUrl = AutoDiscoverServerOnSubnet(_localIp);
            if (!string.IsNullOrEmpty(discoveredUrl))
            {
                _serverBaseUrl = discoveredUrl;
                _isConnectedToServer = true;
                SaveConfig(_serverBaseUrl);
                Log("[✓] Đã tự động tìm thấy Server: " + _serverBaseUrl);
                UpdateStatusMenu();
                return;
            }

            _isConnectedToServer = false;
            Log("[!] Chưa tìm thấy máy chủ Server. Nhấp chuột phải vào biểu tượng khay hệ thống -> 'Đổi địa chỉ IP Server...'.");
            UpdateStatusMenu();
        }

        /// <summary>
        /// Quét song song 254 địa chỉ IP trong cùng subnet `/24` ở cổng 5000 (tối đa 40 luồng đồng thời)
        /// bằng endpoint `/api/usb/agent-ping` để tự động tìm máy chủ IT Helpdesk trong mạng LAN.
        /// </summary>
        private string AutoDiscoverServerOnSubnet(string localIp)
        {
            if (string.IsNullOrEmpty(localIp) || localIp == "127.0.0.1") return null;
            int lastDot = localIp.LastIndexOf('.');
            if (lastDot < 0) return null;
            string prefix = localIp.Substring(0, lastDot + 1);

            string foundUrl = null;
            object lockObj = new object();

            System.Threading.Tasks.Parallel.For(1, 255,
                new System.Threading.Tasks.ParallelOptions { MaxDegreeOfParallelism = 40 },
                (i, state) =>
                {
                    if (foundUrl != null) { state.Stop(); return; }
                    string candidateIp = prefix + i;
                    if (candidateIp == localIp) return;
                    string testUrl = "http://" + candidateIp + ":5000";
                    if (PingServer(testUrl, 700))
                    {
                        lock (lockObj)
                        {
                            if (foundUrl == null)
                            {
                                foundUrl = testUrl;
                                state.Stop();
                            }
                        }
                    }
                });

            return foundUrl;
        }

        /// <summary>
        /// Lưu địa chỉ Backend Server đang hoạt động vào `C:\ProgramData\ITHelpdeskUSBAgent\agent-config.json`.
        /// </summary>
        private void SaveConfig(string url)
        {
            try
            {
                if (!Directory.Exists(InstallDir)) Directory.CreateDirectory(InstallDir);
                string json = "{\"serverUrl\": \"" + url.Replace("\\", "\\\\").Replace("\"", "\\\"") + "\"}";
                File.WriteAllText(ConfigFilePath, json, Encoding.UTF8);
            }
            catch { }
        }

        /// <summary>
        /// Gửi HTTP GET heartbeat tới `/api/usb/agent-ping` để xác minh Backend đang phản hồi HTTP 200 OK.
        /// </summary>
        private bool PingServer(string baseUrl, int timeoutMs = 2000)
        {
            try
            {
                HttpWebRequest req = (HttpWebRequest)WebRequest.Create(baseUrl + "/api/usb/agent-ping");
                req.Method = "GET";
                req.Timeout = timeoutMs;
                req.ReadWriteTimeout = timeoutMs;
                using (HttpWebResponse resp = (HttpWebResponse)req.GetResponse())
                {
                    return resp.StatusCode == HttpStatusCode.OK;
                }
            }
            catch
            {
                return false;
            }
        }

        /// <summary>
        /// Mở hộp thoại cho phép kỹ thuật viên/người dùng thay đổi IP hoặc URL Backend Server thủ công,
        /// sau đó kiểm tra kết nối qua /api/usb/agent-ping, lưu vào file cấu hình và đồng bộ policy ngay.
        /// </summary>
        private void PromptChangeServerUrl()
        {
            using (Form dialog = new Form())
            {
                dialog.Text = "Cấu hình máy chủ IT Helpdesk";
                dialog.Width = 420;
                dialog.Height = 165;
                dialog.FormBorderStyle = FormBorderStyle.FixedDialog;
                dialog.StartPosition = FormStartPosition.CenterScreen;
                dialog.MaximizeBox = false;
                dialog.MinimizeBox = false;

                Label label = new Label
                {
                    Left = 16,
                    Top = 16,
                    Width = 370,
                    Text = "Nhập địa chỉ IP hoặc URL máy chủ Backend (VD: 192.168.1.6 hoặc 127.0.0.1):"
                };
                TextBox input = new TextBox
                {
                    Left = 16,
                    Top = 44,
                    Width = 370,
                    Text = _serverBaseUrl
                };
                Button okBtn = new Button
                {
                    Text = "Kết nối & Lưu",
                    Left = 200,
                    Width = 100,
                    Top = 82,
                    DialogResult = DialogResult.OK
                };
                Button cancelBtn = new Button
                {
                    Text = "Hủy",
                    Left = 306,
                    Width = 80,
                    Top = 82,
                    DialogResult = DialogResult.Cancel
                };

                dialog.Controls.Add(label);
                dialog.Controls.Add(input);
                dialog.Controls.Add(okBtn);
                dialog.Controls.Add(cancelBtn);
                dialog.AcceptButton = okBtn;
                dialog.CancelButton = cancelBtn;

                if (dialog.ShowDialog() == DialogResult.OK)
                {
                    string candidate = NormalizeServerUrl(input.Text);
                    if (string.IsNullOrEmpty(candidate)) return;

                    ThreadPool.QueueUserWorkItem(_ =>
                    {
                        if (PingServer(candidate))
                        {
                            _serverBaseUrl = candidate;
                            _isConnectedToServer = true;
                            SaveConfig(_serverBaseUrl);
                            UpdateStatusMenu();
                            Log("[✓] Đã đổi máy chủ Server thành: " + _serverBaseUrl);
                            SyncPoliciesFromServer();
                            ShowBalloon("Kết nối thành công", "Đã kết nối tới Server: " + _serverBaseUrl, ToolTipIcon.Info);
                        }
                        else
                        {
                            ShowBalloon("Không thể kết nối", "Máy chủ " + candidate + " không phản hồi ở cổng 5000.", ToolTipIcon.Warning);
                        }
                    });
                }
            }
        }

        /// <summary>
        /// Hiển thị cửa sổ Nhật ký hoạt động (Log) dạng console tối màu; khi người dùng đóng cửa sổ
        /// chỉ ẩn (Hide) chứ không kết thúc tiến trình Tray Agent.
        /// </summary>
        private void ShowLogWindow()
        {
            UpdateUi(() =>
            {
                if (_logForm == null || _logForm.IsDisposed)
                {
                    _logForm = new Form();
                    _logForm.Text = "IT Helpdesk USB Security Agent — Nhật ký hoạt động";
                    _logForm.Width = 720;
                    _logForm.Height = 440;
                    _logForm.StartPosition = FormStartPosition.CenterScreen;
                    _logForm.Icon = _trayIcon.Icon;

                    _logTextBox = new TextBox
                    {
                        Multiline = true,
                        ReadOnly = true,
                        ScrollBars = ScrollBars.Vertical,
                        Dock = DockStyle.Fill,
                        Font = new Font("Consolas", 9.5f),
                        BackColor = Color.FromArgb(15, 23, 42),
                        ForeColor = Color.FromArgb(226, 232, 240)
                    };

                    _logForm.Controls.Add(_logTextBox);
                    _logForm.FormClosing += (s, e) =>
                    {
                        if (_isRunning && e.CloseReason == CloseReason.UserClosing)
                        {
                            e.Cancel = true;
                            _logForm.Hide();
                        }
                    };
                }

                lock (_logBuffer)
                {
                    _logTextBox.Text = string.Join(Environment.NewLine, _logBuffer);
                    _logTextBox.SelectionStart = _logTextBox.Text.Length;
                    _logTextBox.ScrollToCaret();
                }

                _logForm.Show();
                _logForm.BringToFront();
                _logForm.Activate();
            });
        }

        /// <summary>
        /// Cập nhật dòng trạng thái kết nối + quyền Admin trong menu chuột phải và tooltip của biểu tượng Tray.
        /// </summary>
        private void UpdateStatusMenu()
        {
            UpdateUi(() =>
            {
                if (_statusMenuItem == null) return;
                string adminText = _isAdmin ? "Admin" : "User";
                _statusMenuItem.Text = _isConnectedToServer
                    ? string.Format("● Đã kết nối: {0} ({1})", _serverBaseUrl, adminText)
                    : string.Format("○ Chưa kết nối Server ({0})", adminText);
                string tip = _isConnectedToServer
                    ? "IT Helpdesk USB Agent — Đang bảo vệ"
                    : "IT Helpdesk USB Agent — Mất kết nối";
                // NotifyIcon.Text giới hạn tối đa 63 ký tự trên Windows
                _trayIcon.Text = tip.Length > 63 ? tip.Substring(0, 63) : tip;
            });
        }

        /// <summary>
        /// Hiển thị thông báo pop-up (Balloon Tip) ở góc phải thanh Taskbar Windows một cách an toàn từ mọi luồng.
        /// </summary>
        private void ShowBalloon(string title, string message, ToolTipIcon icon)
        {
            UpdateUi(() =>
            {
                try
                {
                    if (_trayIcon != null && _trayIcon.Visible)
                    {
                        _trayIcon.ShowBalloonTip(4000, title, message, icon);
                    }
                }
                catch { }
            });
        }

        /// <summary>
        /// Ghi dòng nhật ký có mốc thời gian vào bộ đệm vòng (giới hạn 300 dòng gần nhất) và đẩy ra cửa sổ Log nếu đang mở.
        /// </summary>
        private void Log(string message)
        {
            string line = string.Format("[{0}] {1}", DateTime.Now.ToString("HH:mm:ss"), message);
            lock (_logBuffer)
            {
                _logBuffer.Add(line);
                if (_logBuffer.Count > 300) _logBuffer.RemoveAt(0);
            }

            UpdateUi(() =>
            {
                if (_logForm != null && !_logForm.IsDisposed && _logForm.Visible && _logTextBox != null)
                {
                    _logTextBox.AppendText(line + Environment.NewLine);
                }
            });
        }

        /// <summary>
        /// Thực thi hành động cập nhật giao diện trên luồng UI chính thông qua SynchronizationContext.Post.
        /// </summary>
        private void UpdateUi(Action action)
        {
            try
            {
                _uiContext.Post(_ =>
                {
                    try { action(); } catch { }
                }, null);
            }
            catch { }
        }

        /// <summary>
        /// Dừng vòng lặp nền, dọn dẹp NotifyIcon/Form Log và thoát ApplicationContext sạch sẽ.
        /// </summary>
        private void ExitAgent()
        {
            _isRunning = false;
            if (_trayIcon != null)
            {
                _trayIcon.Visible = false;
                _trayIcon.Dispose();
            }
            if (_logForm != null && !_logForm.IsDisposed)
            {
                _logForm.Dispose();
            }
            ExitThread();
        }

        /// <summary>
        /// Kiểm tra tiến trình hiện tại có đang chạy với quyền Administrator (Elevated) hay không.
        /// </summary>
        private static bool IsRunAsAdministrator()
        {
            try
            {
                WindowsIdentity identity = WindowsIdentity.GetCurrent();
                WindowsPrincipal principal = new WindowsPrincipal(identity);
                return principal.IsInRole(WindowsBuiltInRole.Administrator);
            }
            catch
            {
                return false;
            }
        }

        /// <summary>
        /// Quét toàn bộ thiết bị USB đang kết nối trên máy trạm thông qua 2 truy vấn WMI:
        /// 1. `Win32_DiskDrive WHERE InterfaceType='USB'`: Thu thập USB Flash/ổ cứng ngoài kèm ký tự ổ đĩa & dung lượng.
        /// 2. `Win32_PnPEntity WHERE PNPDeviceID LIKE 'USB%'`: Thu thập thiết bị ngoại vi PnP (âm thanh/camera `audio_video`,
        ///    chuột/bàn phím `input_hid`, điện thoại `mobile_mtp`, lưu trữ, v.v.) và loại bỏ các node trung gian như Root Hub,
        ///    Generic USB Hub, Composite Device hay Host Controller.
        /// </summary>
        private static Dictionary<string, UsbDeviceRecord> ScanCurrentUsbDevices()
        {
            Dictionary<string, UsbDeviceRecord> results =
                new Dictionary<string, UsbDeviceRecord>(StringComparer.OrdinalIgnoreCase);

            // Lớp 1: Quét ổ đĩa USB lưu trữ (Win32_DiskDrive) để lấy đầy đủ DriveLetter & VolumeName
            try
            {
                using (var searcher = new ManagementObjectSearcher(
                    "SELECT DeviceID, PNPDeviceID, Model, Caption, Manufacturer, SerialNumber, Size FROM Win32_DiskDrive WHERE InterfaceType='USB'"))
                {
                    foreach (ManagementObject drive in searcher.Get())
                    {
                        string pnpId = Convert.ToString(drive["PNPDeviceID"] ?? "").Trim();
                        if (string.IsNullOrEmpty(pnpId)) continue;

                        string name = Convert.ToString(drive["Caption"] ?? drive["Model"] ?? "USB Storage Drive").Trim();
                        string vendor = Convert.ToString(drive["Manufacturer"] ?? "USB Storage Vendor").Trim();
                        if (vendor.Equals("(Standard disk drives)", StringComparison.OrdinalIgnoreCase))
                        {
                            vendor = ExtractVendorFromPnpId(pnpId, name);
                        }
                        string serial = Convert.ToString(drive["SerialNumber"] ?? "").Trim();
                        if (string.IsNullOrEmpty(serial))
                        {
                            serial = ExtractSerialFromPnpId(pnpId);
                        }

                        string driveLetter;
                        string volumeInfo;
                        GetDriveLettersAndVolume(drive, out driveLetter, out volumeInfo);

                        results[pnpId] = new UsbDeviceRecord
                        {
                            DeviceId = pnpId,
                            DeviceName = name,
                            Vendor = vendor,
                            SerialNumber = serial,
                            DeviceType = "storage",
                            DriveLetter = driveLetter,
                            VolumeName = volumeInfo
                        };
                    }
                }
            }
            catch { }

            // Lớp 2: Quét toàn bộ thực thể PnP qua cổng USB (âm thanh/video, thiết bị nhập, điện thoại MTP...)
            try
            {
                using (var searcher = new ManagementObjectSearcher(
                    "SELECT PNPDeviceID, Name, Caption, Manufacturer, Service, PNPClass FROM Win32_PnPEntity WHERE PNPDeviceID LIKE 'USB%'"))
                {
                    foreach (ManagementObject entity in searcher.Get())
                    {
                        string pnpId = Convert.ToString(entity["PNPDeviceID"] ?? "").Trim();
                        if (string.IsNullOrEmpty(pnpId) || results.ContainsKey(pnpId)) continue;

                        string upperId = pnpId.ToUpperInvariant();
                        string name = Convert.ToString(entity["Name"] ?? entity["Caption"] ?? "").Trim();
                        string service = Convert.ToString(entity["Service"] ?? "").Trim().ToUpperInvariant();
                        string pnpClass = Convert.ToString(entity["PNPClass"] ?? "").Trim().ToUpperInvariant();

                        // Lọc bỏ các bộ chia Hub, Composite và Host Controller nội bộ để tránh cảnh báo giả
                        if (upperId.StartsWith("USB\\ROOT_HUB") ||
                            service == "USBHUB" ||
                            service == "USBHUB3" ||
                            service == "USBCCGP" ||
                            name.IndexOf("Root Hub", StringComparison.OrdinalIgnoreCase) >= 0 ||
                            name.IndexOf("Generic USB Hub", StringComparison.OrdinalIgnoreCase) >= 0 ||
                            name.IndexOf("Composite Device", StringComparison.OrdinalIgnoreCase) >= 0 ||
                            name.IndexOf("Host Controller", StringComparison.OrdinalIgnoreCase) >= 0)
                        {
                            continue;
                        }

                        // Phân loại nhóm thiết bị USB dựa vào tiền tố PNPDeviceID, driver Service và PNPClass
                        string deviceType = "other_usb";
                        if (upperId.StartsWith("USBSTOR\\") || service == "USBSTOR" || pnpClass == "DISKDRIVE")
                        {
                            deviceType = "storage";
                        }
                        else if (pnpClass == "HIDCLASS" || pnpClass == "KEYBOARD" || pnpClass == "MOUSE" || service == "HIDUSB")
                        {
                            deviceType = "input_hid";
                        }
                        else if (pnpClass == "WPD" || service.Contains("WUDFWPDMTP") || name.IndexOf("MTP", StringComparison.OrdinalIgnoreCase) >= 0)
                        {
                            deviceType = "mobile_mtp";
                        }
                        else if (pnpClass == "MEDIA" || pnpClass == "CAMERA" || pnpClass == "IMAGE" || service == "USBAUDIO" || service == "USBVIDEO")
                        {
                            deviceType = "audio_video";
                        }

                        string vendor = Convert.ToString(entity["Manufacturer"] ?? "").Trim();
                        if (string.IsNullOrEmpty(vendor) || vendor.StartsWith("("))
                        {
                            vendor = ExtractVendorFromPnpId(pnpId, name);
                        }

                        results[pnpId] = new UsbDeviceRecord
                        {
                            DeviceId = pnpId,
                            DeviceName = string.IsNullOrEmpty(name) ? "USB Peripheral Device" : name,
                            Vendor = vendor,
                            SerialNumber = ExtractSerialFromPnpId(pnpId),
                            DeviceType = deviceType,
                            DriveLetter = null,
                            VolumeName = null
                        };
                    }
                }
            }
            catch { }

            return results;
        }

        /// <summary>
        /// Liên kết từ `Win32_DiskDrive` -> `Win32_DiskPartition` -> `Win32_LogicalDisk` trong WMI
        /// để lấy ký tự ổ đĩa (như E:, F:) và nhãn/dung lượng phân vùng (GB).
        /// </summary>
        private static void GetDriveLettersAndVolume(ManagementObject diskDrive, out string driveLetter, out string volumeInfo)
        {
            driveLetter = null;
            volumeInfo = null;
            try
            {
                foreach (ManagementObject partition in diskDrive.GetRelated("Win32_DiskPartition"))
                {
                    foreach (ManagementObject logical in partition.GetRelated("Win32_LogicalDisk"))
                    {
                        string letter = Convert.ToString(logical["DeviceID"] ?? "").Trim();
                        string volName = Convert.ToString(logical["VolumeName"] ?? "").Trim();
                        ulong sizeBytes = 0;
                        if (logical["Size"] != null)
                        {
                            ulong.TryParse(logical["Size"].ToString(), out sizeBytes);
                        }
                        double sizeGb = sizeBytes > 0 ? Math.Round(sizeBytes / (1024.0 * 1024.0 * 1024.0), 1) : 0;

                        if (!string.IsNullOrEmpty(letter))
                        {
                            driveLetter = letter;
                            string label = string.IsNullOrEmpty(volName) ? "USB_DRIVE" : volName;
                            volumeInfo = sizeGb > 0 ? string.Format("{0} ({1} GB)", label, sizeGb) : label;
                            return;
                        }
                    }
                }
            }
            catch { }
        }

        /// <summary>
        /// Trích xuất mã hãng sản xuất (VEN_... hoặc VID_...) từ chuỗi PNPDeviceID hoặc lấy từ khóa đầu của tên thiết bị.
        /// </summary>
        private static string ExtractVendorFromPnpId(string pnpId, string fallbackName)
        {
            if (string.IsNullOrEmpty(pnpId)) return "Unknown Vendor";
            int venIdx = pnpId.IndexOf("VEN_", StringComparison.OrdinalIgnoreCase);
            if (venIdx >= 0)
            {
                string sub = pnpId.Substring(venIdx + 4);
                int amp = sub.IndexOf('&');
                if (amp > 0) return sub.Substring(0, amp);
            }
            int vidIdx = pnpId.IndexOf("VID_", StringComparison.OrdinalIgnoreCase);
            if (vidIdx >= 0 && vidIdx + 8 <= pnpId.Length)
            {
                return pnpId.Substring(vidIdx, 8).ToUpperInvariant();
            }
            if (!string.IsNullOrEmpty(fallbackName))
            {
                string[] parts = fallbackName.Split(' ');
                if (parts.Length > 0) return parts[0];
            }
            return "USB Device Vendor";
        }

        /// <summary>
        /// Trích xuất số Serial ở phân đoạn cuối cùng của chuỗi PNPDeviceID (bỏ hậu tố &0 nếu có).
        /// </summary>
        private static string ExtractSerialFromPnpId(string pnpId)
        {
            if (string.IsNullOrEmpty(pnpId)) return null;
            string[] segments = pnpId.Split('\\');
            if (segments.Length >= 3)
            {
                return segments[segments.Length - 1].Replace("&0", "");
            }
            return null;
        }

        /// <summary>
        /// Dò địa chỉ IPv4 LAN đang hoạt động của máy trạm (bỏ qua Loopback và IP tự cấp APIPA 169.254.x.x).
        /// </summary>
        private static string DetectLocalIpv4()
        {
            try
            {
                foreach (NetworkInterface ni in NetworkInterface.GetAllNetworkInterfaces())
                {
                    if (ni.OperationalStatus != OperationalStatus.Up ||
                        ni.NetworkInterfaceType == NetworkInterfaceType.Loopback)
                    {
                        continue;
                    }

                    foreach (UnicastIPAddressInformation ip in ni.GetIPProperties().UnicastAddresses)
                    {
                        if (ip.Address.AddressFamily == AddressFamily.InterNetwork)
                        {
                            string addr = ip.Address.ToString();
                            if (!addr.StartsWith("169.254."))
                            {
                                return addr;
                            }
                        }
                    }
                }
            }
            catch { }
            return "127.0.0.1";
        }
    }
}
