# AgentPrint — builds dist\AgentPrint : a zero-dependency portable folder.
# Bundles the Node.js runtime (node.exe) + all node_modules, so office PCs
# need NOTHING pre-installed. Run from the project root or via this script.
#   powershell -ExecutionPolicy Bypass -File installer\build-portable.ps1
$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Dist   = Join-Path $ProjectRoot "dist\AgentPrint"
$Assets = Join-Path $PSScriptRoot "assets"
$NodeExe = "C:\Program Files\nodejs\node.exe"

if (-not (Test-Path $NodeExe)) { throw "node.exe not found at $NodeExe — install Node.js LTS first." }
foreach ($f in @("backend\server.js", "agent\agent.js", "agent\setup.js")) {
  if (-not (Test-Path (Join-Path $ProjectRoot $f))) { throw "Missing source file: $f" }
}

Write-Host ">> Cleaning $Dist"
if (Test-Path $Dist) { Remove-Item $Dist -Recurse -Force }
New-Item -ItemType Directory -Force -Path $Dist | Out-Null

Write-Host ">> Bundling Node runtime"
Copy-Item $NodeExe (Join-Path $Dist "node.exe")

Write-Host ">> Copying backend (server\)"
New-Item -ItemType Directory -Force -Path (Join-Path $Dist "server\lib") | Out-Null
Copy-Item (Join-Path $ProjectRoot "backend\server.js") (Join-Path $Dist "server\server.js")
Copy-Item (Join-Path $ProjectRoot "backend\lib\*")     (Join-Path $Dist "server\lib\") -Recurse
Copy-Item (Join-Path $ProjectRoot "backend\package.json") (Join-Path $Dist "server\package.json")

Write-Host ">> Copying backend dependencies (this takes a bit)..."
robocopy (Join-Path $ProjectRoot "backend\node_modules") (Join-Path $Dist "server\node_modules") /E /NFL /NDL /NJH /NJS | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy backend node_modules failed ($LASTEXITCODE)" }

Write-Host ">> Copying web UI (public\)"
robocopy (Join-Path $ProjectRoot "public") (Join-Path $Dist "public") /E /NFL /NDL /NJH /NJS | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy public failed ($LASTEXITCODE)" }

Write-Host ">> Copying agent (agent\) — WITHOUT local config.json"
New-Item -ItemType Directory -Force -Path (Join-Path $Dist "agent") | Out-Null
foreach ($f in @("agent.js", "setup.js", "package.json", "config.example.json")) {
  Copy-Item (Join-Path $ProjectRoot "agent\$f") (Join-Path $Dist "agent\$f")
}
Write-Host ">> Copying agent dependencies..."
robocopy (Join-Path $ProjectRoot "agent\node_modules") (Join-Path $Dist "agent\node_modules") /E /NFL /NDL /NJH /NJS | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy agent node_modules failed ($LASTEXITCODE)" }

Write-Host ">> Launchers + docs"
Copy-Item (Join-Path $Assets "*") $Dist -Recurse
New-Item -ItemType File -Force -Path (Join-Path $Dist "uploads\.gitkeep") | Out-Null
New-Item -ItemType File -Force -Path (Join-Path $Dist "agent\jobs\.gitkeep") | Out-Null

$size = (Get-ChildItem $Dist -Recurse -File | Measure-Object Length -Sum).Sum / 1MB
Write-Host (">> Portable build OK : {0}  ({1:N1} MB, {2} files)" -f $Dist, $size, (Get-ChildItem $Dist -Recurse -File).Count)

Write-Host ">> Smoke test: bundled runtime"
& (Join-Path $Dist "node.exe") --version
& (Join-Path $Dist "node.exe") --check (Join-Path $Dist "agent\agent.js")
& (Join-Path $Dist "node.exe") --check (Join-Path $Dist "server\server.js")
Write-Host ">> All good. Next: compile installer\AgentPrint.iss with Inno Setup."
