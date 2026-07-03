$base = "C:/Users/Tahir/OneDrive/Desktop/nexus-20-ai-agent-os (7)/Agentic OS V3"

# Read all 6 parts
$p1 = Get-Content (Join-Path $base "MASTER_INTEGRATION_PLAN_30_PHASES_P1.md") -Raw
$p2 = Get-Content (Join-Path $base "MASTER_INTEGRATION_PLAN_30_PHASES_P2.md") -Raw
$p3 = Get-Content (Join-Path $base "MASTER_INTEGRATION_PLAN_30_PHASES_P3.md") -Raw
$p4 = Get-Content (Join-Path $base "MASTER_INTEGRATION_PLAN_30_PHASES_P4.md") -Raw
$p5 = Get-Content (Join-Path $base "MASTER_INTEGRATION_PLAN_30_PHASES_P5.md") -Raw
$p6 = Get-Content (Join-Path $base "MASTER_INTEGRATION_PLAN_30_PHASES_P6.md") -Raw

Write-Host "P1: $($p1.Length) chars"
Write-Host "P2: $($p2.Length) chars"
Write-Host "P3: $($p3.Length) chars"
Write-Host "P4: $($p4.Length) chars"
Write-Host "P5: $($p5.Length) chars"
Write-Host "P6: $($p6.Length) chars"
