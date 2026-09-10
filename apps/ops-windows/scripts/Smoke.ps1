param([Parameter(Mandatory=$true)][string]$Executable, [string]$OutputDirectory = 'smoke')
$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force $OutputDirectory | Out-Null
$env:OPS_SMOKE_LOG_DIR = (Resolve-Path $OutputDirectory).Path
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class OpsSmokeWindow {
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr window);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr window, int command);
}
'@
foreach ($theme in @('light', 'dark')) {
$clientProcess = $null
try {
    $clientExecutable = (Resolve-Path $Executable).Path
    $clientProcess = Start-Process -FilePath $clientExecutable -WorkingDirectory (Split-Path $clientExecutable) -ArgumentList @('--smoke', $(if ($theme -eq 'dark') { '--smoke-dark' } else { '--smoke-light' })) -PassThru
    $deadline = [DateTime]::UtcNow.AddSeconds(30)
    do {
        Start-Sleep -Milliseconds 500
        $clientProcess.Refresh()
        if ($clientProcess.HasExited) { throw "Native client exited before showing a window: $($clientProcess.ExitCode)" }
    } while ($clientProcess.MainWindowHandle -eq 0 -and [DateTime]::UtcNow -lt $deadline)
    if ($clientProcess.MainWindowHandle -eq 0) { throw 'Native client did not show a window within 30 seconds.' }
    [OpsSmokeWindow]::ShowWindow($clientProcess.MainWindowHandle, 3) | Out-Null
    [OpsSmokeWindow]::SetForegroundWindow($clientProcess.MainWindowHandle) | Out-Null
    Start-Sleep -Seconds 3
    $clientProcess.Refresh()
    if ($clientProcess.HasExited) { throw 'Native client exited during the rendering check.' }
    if ($clientProcess.MainWindowTitle -ne 'Ops smoke fixture') { throw 'Native launch did not enter the requested smoke fixture.' }
    $bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
    $bitmap = [System.Drawing.Bitmap]::new($bounds.Width, $bounds.Height)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
        $graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
        $bitmap.Save((Join-Path (Resolve-Path $OutputDirectory) "native-work-$theme.png"), [System.Drawing.Imaging.ImageFormat]::Png)
    } finally { $graphics.Dispose(); $bitmap.Dispose() }
    @{ launched = $true; windowTitle = $clientProcess.MainWindowTitle; width = $bounds.Width; height = $bounds.Height } | ConvertTo-Json | Set-Content (Join-Path $OutputDirectory "launch-$theme.json")
} catch {
    Get-WinEvent -FilterHashtable @{ LogName = 'Application'; StartTime = [DateTime]::Now.AddMinutes(-2) } -ErrorAction SilentlyContinue |
        Where-Object { $_.Message -match 'Ops.Client' } |
        Select-Object TimeCreated, Id, Message |
        Format-List | Out-String | Set-Content (Join-Path $OutputDirectory "application-errors-$theme.txt")
    if (Test-Path (Join-Path $OutputDirectory 'startup-errors.txt')) { Get-Content (Join-Path $OutputDirectory 'startup-errors.txt') }
    throw
} finally {
    if ($clientProcess -and !$clientProcess.HasExited) { Stop-Process -Id $clientProcess.Id -Force }
}
}
