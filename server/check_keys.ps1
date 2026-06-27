$env:PATH = 'C:\Program Files\PostgreSQL\17\bin;' + $env:PATH
$env:PGPASSWORD='***'
psql -h 127.0.0.1 -U postgres -d nexus -c 'SELECT id, name, key_hash FROM api_keys;'
