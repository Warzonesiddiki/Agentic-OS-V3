#!/usr/bin/env python3
"""Quick API test helper. Usage: python3 api_test.py <path>"""
import urllib.request, json, sys

with open('.env') as f:
    for line in f:
        if 'NEXUS_API_KEY' in line:
            KEY = line.strip().split('=', 1)[1]
            break

path = sys.argv[1] if len(sys.argv) > 1 else '/api/v1/health'
url = f'http://127.0.0.1:9900{path}'
headers = {'Authorization': f'Bearer {KEY}'}

req = urllib.request.Request(url, headers=headers)
try:
    resp = urllib.request.urlopen(req, timeout=5)
    print(json.dumps(json.loads(resp.read()), indent=2))
except urllib.error.HTTPError as e:
    print(f'HTTP {e.code}: {e.read().decode()[:300]}')
