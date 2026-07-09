# FLEET CONTROL PLANE - Global Verification Gate
# Run after any agent's ACT step. Enforces the Perfection Bar at fleet level and
# appends a snapshot to fleet/scoreboard.json (the fleet-level feedback signal).
$ErrorActionPreference = 'Continue'
$RepoRoot = (Get-Item $PSScriptRoot).Parent.FullName
# Use the hermes node (v22) - the default node v9 crashes on ESM.
$env:PATH = "C:\Users\Tahir\AppData\Local\hermes\node;" + $env:PATH

$ts = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')

# -- Server tsc --
Push-Location (Join-Path $RepoRoot 'server')
$srvOut = node ./node_modules/typescript/bin/tsc --noEmit --incremental false 2>&1
$srvErr = ($srvOut | Select-String 'error TS').Count
Pop-Location

# -- Root (frontend) tsc --
Push-Location $RepoRoot
$rootOut = node ./node_modules/typescript/bin/tsc --noEmit -p tsconfig.json 2>&1
$rootErr = ($rootOut | Select-String 'error TS').Count
Pop-Location

# -- Rust check (optional; set $env:FLEET_RUST=1 to enable - can be slow) --
$rustErr = $null
$rustPass = $null
if ($env:FLEET_RUST -eq '1') {
  Push-Location $RepoRoot
  $rustOut = cargo check --workspace 2>&1
  $rustErr = ($rustOut | Select-String 'error\[').Count
  $rustPass = ($rustErr -eq 0)
  Pop-Location
}

$perfect = ($srvErr -eq 0) -and ($rootErr -eq 0)

$snap = [ordered]@{
  timestamp         = $ts
  perfect           = $perfect
  server_tsc_errors = $srvErr
  root_tsc_errors   = $rootErr
  rust_check_errors = $rustErr
  gates             = [ordered]@{
    server_tsc = ($srvErr -eq 0)
    root_tsc   = ($rootErr -eq 0)
    rust_check = $rustPass
  }
}

$boardPath = Join-Path $RepoRoot 'fleet/scoreboard.json'
$history = @()
if (Test-Path $boardPath) {
  try { $history = Get-Content $boardPath -Raw | ConvertFrom-Json } catch { $history = @() }
}
$history += $snap
if ($history.Count -gt 200) { $history = $history[-200..(-1)] }
$history | ConvertTo-Json -Depth 10 | Set-Content $boardPath

Write-Host "FLEET GATE | server_tsc=$srvErr root_tsc=$rootErr rust=$rustErr PERFECT=$perfect"
