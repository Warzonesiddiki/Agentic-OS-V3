with open('MASTER_INTEGRATION_PLAN_30_PHASES_P1.md', 'rb') as f:
    data = f.read()

idx = data.find(b'crates/')
with open('out.txt', 'w') as out:
    out.write('crates found at byte ' + str(idx) + '\n')
    out.write(data[max(0,idx-20):idx+500].decode('utf-8', 'ignore'))

print('DONE')