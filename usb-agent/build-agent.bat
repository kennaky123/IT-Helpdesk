@echo off
chcp 65001 >nul
echo [*] Dang dong goi ITHelpdeskUSBAgent.exe (Windows Tray App + Quyen Admin)...
"C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe" /nologo /target:winexe /win32manifest:"%~dp0app.manifest" /out:"%~dp0ITHelpdeskUSBAgent.exe" /r:System.Management.dll /r:System.Web.Extensions.dll /r:System.Windows.Forms.dll /r:System.Drawing.dll "%~dp0ITHelpdeskUSBAgent.cs"
if %ERRORLEVEL% EQU 0 (
    echo [OK] Da dong goi thanh cong: %~dp0ITHelpdeskUSBAgent.exe
) else (
    echo [ERROR] Dong goi that bai!
)
