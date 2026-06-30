"""Obsidian state sync script.
Saves nexus-20 project state snapshot to Obsidian vault every cycle."""
import json, os, subprocess, time, sys
from pathlib import Path

VAULT = Path(os.path.expanduser("~")) / "OneDrive" / "Documents" / "Obsidian Vault"
PROJECT_NOTE = VAULT / "projects" / "nexus-20-ai-agent-os.md"
SERVER_DIR = Path(os.path.expanduser("~")) / "OneDrive" / "Desktop" / "nexus-20-ai-agent-os (7)" / "server"
ENV_FILE = SERVER_DIR / ".env"
PGPASS = Path(os.path.expanduser("~")) / "pgpass_temp"
PG_BIN = r"C:\Program Files\PostgreSQL\17\bin"

def get_api_key():
    """Read NEXUS_API_KEY from .env"""
    if not ENV_FILE.exists():
        return None
    with open(ENV_FILE) as f:
        for line in f:
            if "NEXUS_API_KEY" in line and not line.strip().startswith("#"):
                return line.strip().split("=", 1)[1]
    return None

def mtime(path):
    return os.path.getmtime(path) if path.exists() else 0

def main():
    result = {"ts": time.time(), "ok": True, "server": "down", "agents": 0, "memories": 0, "tables": 0}
    
    # 1. Check if server is running (port 9900)
    try:
        import urllib.request
        import ssl
        ctx = ssl._create_unverified_context()
        req = urllib.request.Request("http://127.0.0.1:9900/api/v1/health")
        resp = urllib.request.urlopen(req, timeout=3, context=ctx)
        if resp.status == 200:
            result["server"] = "up"
            # Auth'd check
            key = get_api_key()
            if key:
                req2 = urllib.request.Request("http://127.0.0.1:9900/api/v1/memories",
                    headers={"Authorization": f"Bearer {key}"})
                resp2 = urllib.request.urlopen(req2, timeout=3, context=ctx)
                if resp2.status == 200:
                    data = json.loads(resp2.read())
                    result["memories"] = data.get("data", {}).get("total", 0) if isinstance(data.get("data"), dict) else 0
                    
                req3 = urllib.request.Request("http://127.0.0.1:9900/api/v1/agents",
                    headers={"Authorization": f"Bearer {key}"})
                resp3 = urllib.request.urlopen(req3, timeout=3, context=ctx)
                if resp3.status == 200:
                    data3 = json.loads(resp3.read())
                    result["agents"] = len(data3.get("data", {}).get("items", []))
    except Exception:
        result["server"] = "down"

    # 2. Check DB
    try:
        env = os.environ.copy()
        env["PGPASSFILE"] = str(PGPASS)
        env["PATH"] = env.get("PATH", "") + ";" + PG_BIN
        r = subprocess.run(
            ["psql", "-h", "127.0.0.1", "-U", "postgres", "-d", "nexus", 
             "-t", "-A", "-c", "SELECT count(*)::int FROM information_schema.tables WHERE table_schema='public';"],
            capture_output=True, text=True, timeout=5, env=env
        )
        if r.returncode == 0 and r.stdout.strip().isdigit():
            result["tables"] = int(r.stdout.strip())
    except Exception:
        pass
    
    # 3. Append to Obsidian note
    status = "🟢" if result["server"] == "up" else "🔴"
    line = f"\n- **{time.strftime('%Y-%m-%d %H:%M:%S')}** {status} server={result['server']} agents={result['agents']} memories={result['memories']} tables={result['tables']}"
    
    if PROJECT_NOTE.exists():
        with open(PROJECT_NOTE, "a") as f:
            f.write(line)
    
    print(json.dumps(result))

if __name__ == "__main__":
    main()
