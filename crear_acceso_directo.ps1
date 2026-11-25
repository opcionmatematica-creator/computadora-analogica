# Crea "Computadora Analogica" en el Escritorio (ejecutar una vez):
#   powershell -ExecutionPolicy Bypass -File crear_acceso_directo.ps1
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$desk = [Environment]::GetFolderPath("Desktop")
$sh = New-Object -ComObject WScript.Shell
$lnk = $sh.CreateShortcut((Join-Path $desk "Computadora Analogica.lnk"))
$lnk.TargetPath = "$env:WINDIR\System32\wscript.exe"
$lnk.Arguments = '"' + (Join-Path $dir "Computadora Analogica.vbs") + '"'
$lnk.WorkingDirectory = $dir
$ico = Join-Path $dir "web\assets\icon.ico"
if (Test-Path $ico) { $lnk.IconLocation = $ico }
$lnk.Description = "Computadora analógica por módulos (KiCad + ngspice + Blender)"
$lnk.Save()
Write-Host "Acceso directo creado en $desk"
