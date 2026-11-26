' Lanzador de la aplicación de escritorio (sin ventana de consola).
' Usa el ejecutable nativo (Rust, app/) si está compilado; si no, el servidor de Node (server.js).
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = dir
exe = dir & "\app\target\release\computadora-analogica.exe"
If fso.FileExists(exe) Then
  sh.Run """" & exe & """", 0, False
Else
  sh.Run "node """ & dir & "\server.js""", 0, False
End If
