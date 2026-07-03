with open('MASTER_INTEGRATION_PLAN_30_PHASES_P1.md', 'rb') as f:
    data = f.read()

idx = data.find(b'crates/')
segment = data[max(0,idx-10):idx+600]
with open('crates_raw.txt', 'wb') as out:
    out.write(segment)

print("SUCCESS: wrote crates_raw.txt")