#!/usr/bin/env python3
import sys
sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

with open('MASTER_INTEGRATION_PLAN_30_PHASES_P1.md', 'r', encoding='utf-8-sig') as f:
    content = f.read()

# The file uses Unicode box-drawing characters
# │ = \u2502, ├── = \u251c\u2500\u2500, └── = \u2514\u2500\u2500

# Find the crates section start
idx = content.find('crates/')
if idx < 0:
    print("crates/ not found")
    sys.exit(1)

# Find the start of the crates section line
line_start = content.rfind('\n', 0, idx) + 1
line_end = content.find('\n', idx)
crates_line = content[line_start:line_end]
print(f"Crates header line: {repr(crates_line)}")

# Now find the end - look for the packages header
pkg_idx = content.find('packages/                      # TypeScript packages', idx)
if pkg_idx < 0:
    # Try without trailing spaces
    pkg_idx = content.find('packages/', idx)
    if pkg_idx < 0:
        print("packages/ not found after crates")
        sys.exit(1)

# Find the newline before packages header
pkg_line_start = content.rfind('\n', 0, pkg_idx) + 1
# The section ends at the newline before packages header
section_end = pkg_line_start

old_section = content[line_start:section_end]
print(f"\nSection length: {len(old_section)} chars")
print(f"Section starts at byte {line_start}, ends at {section_end}")

# Print the full section
print("\n=== FULL CRATES SECTION ===")
print(old_section)

# Also find the exact strings for each crate line
print("\n=== CRATE LINES FOUND ===")
for term in ['core/', 'config/', 'acp/', 'gateway/', 'orchestrator/', 'mcp/', 'local-inference/', 'dictation/', 'security/', 'telemetry/', 'sandbox/']:
    pos = content.find(term, line_start, section_end)
    if pos >= 0:
        line_start = content.rfind('\n', 0, pos) + 1
        line_end = content.find('\n', pos)
        line = content[line_start:line_end]
        print(f"  {term}: {repr(line)}")

# Save the exact section for reference
with open('crates_section_exact.txt', 'w', encoding='utf-8') as f:
    f.write(old_section)
print("\nWrote exact section to crates_section_exact.txt")