$path = "crates/provider-types/src/images.rs"
$raw = [System.IO.File]::ReadAllText($path)
$marker = "if let Some(window) = text.get(floor..end)"
$pos = $raw.IndexOf($marker)
Write-Output "marker pos = $pos"
$sub = $raw.Substring($pos, 950)
$lines = $sub -split "`r?`n"
for ($i = 0; $i -lt $lines.Length; $i++) {
    Write-Output ("{0,3}: {1}" -f ($i+1), $lines[$i])
}
