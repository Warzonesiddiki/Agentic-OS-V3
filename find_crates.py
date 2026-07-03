#!/usr/bin/env python3
import sys
sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

with open('MASTER_INTEGRATION_PLAN_30_PHASES_P1.md', 'r', encoding='utf-8-sig') as f:
    content = f.read()

# Find the crates section
start_marker = 'crates/                        # Rust crates (Cargo workspace)\n'
end_marker = '\npackages/                      # TypeScript packages'

start_idx = content.find(start_marker)
end_idx = content.find(end_marker, start_idx)

if start_idx >= 0 and end_idx >= 0:
    print(f"FOUND: crates section at {start_idx}-{end_idx}")
    old_section = content[start_idx:end_idx]
    print(f"Length: {len(old_section)}")
    print("OLD SECTION:")
    print(old_section[:800])
else:
    print("NOT FOUND")
    idx = content.find('crates/')
    if idx >= 0:
        print(f"Found 'crates/' at {idx}")
        print(repr(content[idx:idx+100]))