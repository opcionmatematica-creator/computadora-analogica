# Captura la ventana de la app de escritorio (o la pantalla entera) a PNG.
#   powershell -ExecutionPolicy Bypass -File tools\captura_ventana.ps1 -Out salida.png [-Title "Computadora"] [-Full]
param([string]$Out = "captura.png", [string]$Title = "Computadora", [switch]$Full)
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
Add-Type @"
using System; using System.Runtime.InteropServices;
public class W {
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  public struct RECT { public int L, T, R, B; }
}
"@
[W]::SetProcessDPIAware() | Out-Null
$p = Get-Process msedge, chrome -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -like "*$Title*" } | Select-Object -First 1
if ($Full -or -not $p) {
  $b = [System.Windows.Forms.SystemInformation]::VirtualScreen
  $x, $y, $w, $h = $b.X, $b.Y, $b.Width, $b.Height
} else {
  [W]::ShowWindow($p.MainWindowHandle, 9) | Out-Null
  [W]::SetForegroundWindow($p.MainWindowHandle) | Out-Null
  Start-Sleep -Milliseconds 700
  $r = New-Object W+RECT; [W]::GetWindowRect($p.MainWindowHandle, [ref]$r) | Out-Null
  $x, $y, $w, $h = $r.L, $r.T, ($r.R - $r.L), ($r.B - $r.T)
}
$bmp = New-Object System.Drawing.Bitmap $w, $h
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($x, $y, 0, 0, $bmp.Size)
$bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
Write-Host "guardado $Out ($w x $h)"
