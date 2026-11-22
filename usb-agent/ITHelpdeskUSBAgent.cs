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

    public class AgentConfig
    {
        public string serverUrl { get; set; }
    }

    static class Program
    {
        private static Mutex SingleInstanceMutex;

        [STAThread]
        static void Main(string[] args)
        {
            bool createdNew;
            SingleInstanceMutex = new Mutex(true, "Local\\ITHelpdeskUSBAgent_Tray_v2", out createdNew);
            if (!createdNew)
            {
                return;
            }

            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            try
            {
                Application.Run(new TrayAgentContext(args));
            }
            finally
            {
                try { SingleInstanceMutex.ReleaseMutex(); } catch { }
                SingleInstanceMutex.Dispose();
            }
        }
    }

    public class TrayAgentContext : ApplicationContext
    {
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

        private readonly string _hostname = Environment.MachineName;
        private readonly string _osUsername = Environment.UserName;
        private readonly string _localIp;
        private readonly bool _isAdmin;
        private readonly JavaScriptSerializer _jsonSerializer = new JavaScriptSerializer();
        private readonly Dictionary<string, UsbDeviceRecord> _connectedDevices =
            new Dictionary<string, UsbDeviceRecord>(StringComparer.OrdinalIgnoreCase);
        private readonly HashSet<string> _blockedByAgent =
            new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        private readonly object _syncLock = new object();
        private readonly List<string> _logBuffer = new List<string>();
        private readonly SynchronizationContext _uiContext;

        private string _serverBaseUrl = "http://192.168.1.6:5000";
        private bool _isConnectedToServer = false;
        private volatile bool _isRunning = true;
        private int _simulatedCounter = 1;

        private NotifyIcon _trayIcon;
        private ToolStripMenuItem _statusMenuItem;
        private ToolStripMenuItem _startupMenuItem;
        private Form _logForm;
        private TextBox _logTextBox;
        private Thread _workerThread;

        public TrayAgentContext(string[] args)
        {
            _uiContext = SynchronizationContext.Current ?? new WindowsFormsSynchronizationContext();
            _localIp = DetectLocalIpv4();
            _isAdmin = IsRunAsAdministrator();

            BuildTrayIcon();
            Log("Khởi động IT Helpdesk USB Security & DLP Agent v2.0 (Chạy ngầm System Tray)");
            Log(string.Format("Máy trạm: {0} | User: {1} | IP: {2} | Quyền Admin: {3}",
                _hostname, _osUsername, _localIp, _isAdmin ? "CÓ" : "KHÔNG"));

            _workerThread = new Thread(() => RunBackgroundLoop(args));
            _workerThread.IsBackground = true;
            _workerThread.Start();
        }

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

        private Icon CreateShieldIcon()
        {
            Bitmap bmp = new Bitmap(32, 32);
            using (Graphics g = Graphics.FromImage(bmp))
            {
                g.SmoothingMode = SmoothingMode.AntiAlias;
                g.Clear(Color.Transparent);

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

                // Draw crisp white USB trident symbol inside shield
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
                    PollUsbChanges();

                    // Đồng bộ chính sách chặn/mở khóa từ Server mỗi ~3 giây
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

        private bool IsStartupTaskRegistered()
        {
            string output;
            int code = RunProcess("schtasks.exe", string.Format("/query /tn \"{0}\"", TaskName), out output);
            return code == 0;
        }

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

        private bool UnregisterStartupTask()
        {
            string output;
            int code = RunProcess("schtasks.exe", string.Format("/delete /tn \"{0}\" /f", TaskName), out output);
            return code == 0;
        }

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

                    if (!_isConnectedToServer)
                    {
                        _isConnectedToServer = true;
                        UpdateStatusMenu();
                    }
                }
            }
            catch
            {
                if (_isConnectedToServer)
                {
                    _isConnectedToServer = false;
                    UpdateStatusMenu();
                }
            }
        }

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

            foreach (var kvp in initialDevices)
            {
                if (kvp.Value.DeviceType == "storage")
                {
                    SendUsbEventToServer(kvp.Value, "connected");
                }
            }
        }

        private void PollUsbChanges()
        {
            Dictionary<string, UsbDeviceRecord> current = ScanCurrentUsbDevices();
            List<UsbDeviceRecord> newlyConnected = new List<UsbDeviceRecord>();
            List<UsbDeviceRecord> newlyRemoved = new List<UsbDeviceRecord>();

            lock (_syncLock)
            {
                foreach (var kvp in current)
                {
                    if (!_connectedDevices.ContainsKey(kvp.Key))
                    {
                        _connectedDevices[kvp.Key] = kvp.Value;
                        newlyConnected.Add(kvp.Value);
                    }
                }

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
                _trayIcon.Text = tip.Length > 63 ? tip.Substring(0, 63) : tip;
            });
        }

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

        private static Dictionary<string, UsbDeviceRecord> ScanCurrentUsbDevices()
        {
            Dictionary<string, UsbDeviceRecord> results =
                new Dictionary<string, UsbDeviceRecord>(StringComparer.OrdinalIgnoreCase);

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
