# PowerShell script to compile the 6 parts of the integration plan
$base = "C:\Users\Tahir\OneDrive\Desktop\nexus-20-ai-agent-os (7)\Agentic OS V3"
$parts = @("P1","P2","P3","P4","P5","P6")

$allContent = @()

foreach ($p in $parts) {
    $file = Join-Path $base "MASTER_INTEGRATION_PLAN_30_PHASES_${p}.md"
    Write-Host "Reading $file..."
    $content = Get-Content $file -Raw
    $allContent += $content
}

# Join with a separator between parts
$combined = $allContent -join "`n`n---`n`n"

# Write output
$outputFile = Join-Path $base "MASTER_INTEGRATION_PLAN_30_PHASES.md"
Set-Content -Path $outputFile -Value $combined

# Get line count
$lineCount = ($combined -split "`r`n" | Measure-Object).Count
Write-Host "Done! Total lines: $lineCount"
Write-Host "Output: $outputFile"
