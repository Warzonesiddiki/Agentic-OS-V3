with open('MASTER_INTEGRATION_PLAN_30_PHASES_P1.md', 'rb') as f:
    data = f.read()

idx = data.find(b'crates/')
segment = data[max(0,idx-10):idx+600]

with open('debug_output.txt', 'w') as out:
    out.write('HEX:\n')
    out.write(' '.join(hex(b) for b in segment[:80]) + '\n\n')
    out.write('TEXT:\n')
    out.write(segment[:200].decode('utf-8', 'ignore'))

print("SUCCESS")