' AgentPrint Agent — hidden launcher (no console window).
' Target of the Start Menu / Startup shortcuts created by the installer.
Dim sh, fso, root
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
root = fso.GetParentFolderName(WScript.ScriptFullName)
sh.Run """" & root & "\node.exe"" """ & root & "\agent\agent.js""", 0, False
Set sh = Nothing
Set fso = Nothing
