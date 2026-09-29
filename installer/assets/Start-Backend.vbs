' AgentPrint local backend — hidden launcher (LAN-only mode).
Dim sh, fso, root
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
root = fso.GetParentFolderName(WScript.ScriptFullName)
sh.Run """" & root & "\node.exe"" """ & root & "\server\server.js""", 0, False
Set sh = Nothing
Set fso = Nothing
