; ============================================================
; AgentPrint 1.0.0 — Inno Setup installer (production ready)
; One Setup.exe installs everything a printer PC needs:
;   - Printer Agent (required, auto-starts with Windows, no console)
;   - Local backend server (optional, for LAN-only offices without cloud)
; No Node.js / npm / tech skills required on the office PC.
; Per-user install -> NO admin rights / UAC prompt needed.
; Compile: "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" AgentPrint.iss
; ============================================================
#define MyAppName "AgentPrint"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "AgentPrint"
#define SrcDir "..\dist\AgentPrint"

[Setup]
AppId={{B7E4C2A1-9F3D-4E6B-8C5A-1D2F3A4B5C6D}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppComments=Scan QR, send file, collect papers. Zero manual work.
DefaultDirName={localappdata}\AgentPrint
PrivilegesRequired=lowest
OutputDir=Output
OutputBaseFilename=AgentPrint-Setup-{#MyAppVersion}
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
DisableProgramGroupPage=yes
UninstallDisplayName=AgentPrint (office print agent)
SetupIconFile=

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Components]
Name: "agent"; Description: "Printer Agent (required — auto-prints on this PC)"; Types: full compact custom; Flags: fixed
Name: "localserver"; Description: "Local backend server (only for LAN-only offices without cloud)"; Types: full

[Tasks]
Name: "startup"; Description: "Start AgentPrint Agent automatically when Windows starts (recommended)"; GroupDescription: "Windows startup:"; Components: agent
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Shortcuts:"; Components: agent

[Files]
; --- shared runtime ---
Source: "{#SrcDir}\node.exe"; DestDir: "{app}"; Flags: ignoreversion; Components: agent
; --- agent ---
Source: "{#SrcDir}\agent\*"; DestDir: "{app}\agent"; Flags: ignoreversion recursesubdirs createallsubdirs; Components: agent
Source: "{#SrcDir}\Start-Agent.vbs"; DestDir: "{app}"; Flags: ignoreversion; Components: agent
Source: "{#SrcDir}\Start-Agent-Console.bat"; DestDir: "{app}"; Flags: ignoreversion; Components: agent
Source: "{#SrcDir}\Agent-Dashboard.url"; DestDir: "{app}"; Flags: ignoreversion; Components: agent
Source: "{#SrcDir}\README-FIRST.txt"; DestDir: "{app}"; Flags: ignoreversion isreadme; Components: agent
; --- local backend (LAN mode) ---
Source: "{#SrcDir}\server\*"; DestDir: "{app}\server"; Flags: ignoreversion recursesubdirs createallsubdirs; Components: localserver
Source: "{#SrcDir}\public\*"; DestDir: "{app}\public"; Flags: ignoreversion recursesubdirs createallsubdirs; Components: localserver
Source: "{#SrcDir}\uploads\.gitkeep"; DestDir: "{app}\uploads"; Flags: ignoreversion; Components: localserver
Source: "{#SrcDir}\Start-Backend.vbs"; DestDir: "{app}"; Flags: ignoreversion; Components: localserver
Source: "{#SrcDir}\Start-Backend-Console.bat"; DestDir: "{app}"; Flags: ignoreversion; Components: localserver
Source: "{#SrcDir}\Backend-Dashboard.url"; DestDir: "{app}"; Flags: ignoreversion; Components: localserver

[Icons]
Name: "{autoprograms}\AgentPrint Agent (hidden)"; Filename: "{app}\Start-Agent.vbs"; Components: agent
Name: "{autoprograms}\AgentPrint Agent console"; Filename: "{app}\Start-Agent-Console.bat"; Components: agent
Name: "{autoprograms}\AgentPrint Agent dashboard"; Filename: "{app}\Agent-Dashboard.url"; Components: agent
Name: "{autoprograms}\AgentPrint Backend console (LAN)"; Filename: "{app}\Start-Backend-Console.bat"; Components: localserver
Name: "{autostartup}\AgentPrint Agent"; Filename: "{app}\Start-Agent.vbs"; Tasks: startup; Components: agent
Name: "{autodesktop}\AgentPrint"; Filename: "{app}\Start-Agent.vbs"; Tasks: desktopicon; Components: agent

[Run]
Filename: "{app}\node.exe"; Parameters: """{app}\agent\setup.js"""; Description: "Configure office code now (recommended)"; Flags: postinstall skipifsilent runasoriginaluser; Components: agent
Filename: "{app}\Start-Agent.vbs"; Description: "Start AgentPrint Agent now"; Flags: postinstall shellexec skipifsilent runasoriginaluser unchecked; Components: agent

[UninstallDelete]
Type: filesandordirs; Name: "{app}\uploads"
Type: filesandordirs; Name: "{app}\agent\jobs"

[Code]
procedure CurStepChanged(CurStep: TSetupStep);
begin
  if (CurStep = ssDone) and not WizardSilent() then
  begin
    if not FileExists('C:\Program Files\LibreOffice\program\soffice.exe') and
       not FileExists('C:\Program Files (x86)\LibreOffice\program\soffice.exe') then
      MsgBox('Tip: install the free LibreOffice for automatic Word / Excel / PowerPoint printing.' + #13#10 +
             'PDF and images already print with nothing extra to install.', mbInformation, MB_OK);
  end;
end;
