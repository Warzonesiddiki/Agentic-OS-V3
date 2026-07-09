$path = "crates/provider-types/src/images.rs"
$raw = [System.IO.File]::ReadAllText($path)
$start = $raw.IndexOf("if let Some(window) = text.get(floor..end) {")
$endMarker = "                }"
# Find the closing of the inner for-loop block: the block that ends with "}" + newline then "            }"
$end = $raw.IndexOf("            }`r`n", $start)
if ($end -lt 0) { $end = $raw.IndexOf("            }`n", $start) }
# We want to keep up to and including that "            }"
$oldBlock = $raw.Substring($start, $end - $start + "            }".Length)
Write-Output "OLD BLOCK LENGTH = $($oldBlock.Length)"
Write-Output "---- OLD BLOCK TAIL ----"
$oldBlock -split "`r?`n" | Select-Object -Last 6 | ForEach-Object { Write-Output $_ }

$newBlock = @'
                if let Some(window) = text.get(floor..end) {
                    // A path may start at `/` (Unix) or `\` (Windows), or at a
                    // drive-letter prefix like `C:\`. Collect every candidate
                    // start index within the window.
                    let mut starts: Vec<usize> = Vec::new();
                    for (rel, _) in window.match_indices('/') {
                        starts.push(rel);
                    }
                    for (rel, _) in window.match_indices('\\') {
                        starts.push(rel);
                    }
                    let wbytes = window.as_bytes();
                    for rel in 0..wbytes.len() {
                        if (wbytes[rel] as char).is_ascii_alphabetic()
                            && rel + 1 < wbytes.len()
                            && wbytes[rel + 1] == b':'
                        {
                            let after = window.get(rel + 2..).and_then(|s| s.chars().next());
                            if matches!(after, Some('/') | Some('\\')) {
                                starts.push(rel);
                            }
                        }
                    }

                    for rel in starts {
                        let start = floor + rel;
                        let preceded_by_boundary = text
                            .get(..start)
                            .and_then(|prefix| prefix.chars().next_back())
                            .is_none_or(|c| c.is_whitespace() || c == '"' || c == '\'');
                        if !preceded_by_boundary {
                            continue;
                        }
                        let Some(raw_candidate) = text.get(start..end) else {
                            continue;
                        };
                        let candidate = image_path_candidate(raw_candidate);
                        if let Some(candidate_path) = candidate {
                            // Keep the first referenced path, but allow a longer
                            // match anchored at the same start to extend it (a
                            // whitespace-terminated extension may be a prefix of a
                            // spaced filename ending in a later extension).
                            match best {
                                Some((best_start, _)) if start == best_start => {
                                    best = Some((start, candidate_path));
                                }
                                None => best = Some((start, candidate_path)),
                                Some(_) => {}
                            }
                            break;
                        }
                    }
                }
'@

$replaced = $raw.Replace($oldBlock, $newBlock)
[System.IO.File]::WriteAllText($path, $replaced)
Write-Output "PATCH APPLIED. new length diff: $($replaced.Length - $raw.Length)"
