$path = "crates/provider-types/src/images.rs"
$raw = [System.IO.File]::ReadAllText($path)
$start = $raw.IndexOf("// A path may start at")
$raw.Substring($start, 1700) -split "`r?`n" | ForEach-Object { $i=0 } { $i++; Write-Output ("{0,3}: {1}" -f $i, $_) }
