Option Explicit
Dim shell, files, root, mode, command
Set shell = CreateObject("WScript.Shell")
Set files = CreateObject("Scripting.FileSystemObject")
root = files.GetParentFolderName(WScript.ScriptFullName)
mode = "Open"
If WScript.Arguments.Count > 0 Then mode = WScript.Arguments(0)
If mode <> "Open" And mode <> "Background" And mode <> "Stop" Then WScript.Quit 1
command = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & root & "\launcher.ps1"" -Mode " & mode
shell.Run command, 0, False
