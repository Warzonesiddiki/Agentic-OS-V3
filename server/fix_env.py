import re

with open('.env.example', 'r') as f:
    content = f.read()

# Replace DATABASE_URL to use 127.0.0.1 instead of localhost (IPv6 auth issues)
content = content.replace(
    'DATABASE_URL=postgresql://postgres:***@localhost:5432/nexus',
    'DATABASE_URL=postgresql://postgres:***@127.0.0.1:5432/nexus'
)

# Set NEXUS_API_KEY to a known value  
content = re.sub(
    r'^NEXUS_API_KEY=.*',
    'NEXUS_API_KEY=nk_nexus_dev_key_ayc_2024',
    content,
    flags=re.MULTILINE
)

# Set log level to debug
content = re.sub(
    r'^NEXUS_LOG_LEVEL=info.*',
    'NEXUS_LOG_LEVEL=debug',
    content,
    flags=re.MULTILINE
)

with open('.env', 'w') as f:
    f.write(content)

print("OK")
