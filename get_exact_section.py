with open('MASTER_INTEGRATION_PLAN_30_PHASES_P1.md', 'rb') as f:
    data = f.read()

idx = data.find(b'crates/')
# Find start of line (look for newline before)
line_start = data.rfind(b'\n', 0, idx)
if line_start == -1:
    line_start = 0
else:
    line_start += 1

# Find end - look for 'packages/' section
pkg_idx = data.find(b'packages/', idx)
if pkg_idx == -1:
    pkg_idx = idx + 800

# Find the newline before packages
line_end = data.rfind(b'\n', 0, pkg_idx)
if line_end == -1:
    line_end = pkg_idx

section = data[line_start:line_end]
print(f"Section length: {len(section)}")
print(f"Start: {line_start}, End: {line_end}")

# Save exact section bytes
with open('exact_crates_section.bin', 'wb') as out:
    out.write(section)

# Also print as text
print("\nAs text:")
print(section.decode('utf-8', 'ignore'))

# And print hex
print("\nHex:")
print(' '.join(hex(b) for b in section))