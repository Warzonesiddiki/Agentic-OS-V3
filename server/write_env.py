#!/usr/bin/env python3
"""Write .env for nexus server."""
PW = "p123"  # actual PG password for scram-sha-256 auth

def main():
    lines = [
        "NODE_ENV=development",
        "NEXUS_LOG_LEVEL=debug",
        "PORT=9900",
        "HOST=0.0.0.0",
        f"DATABASE_URL=postgresql://postgres:{PW}@127.0.0.1:5432/nexus",
        "NEXUS_API_KEY=nk_nexus_dev_key_ayc_2024",
        "NEXUS_DASHBOARD_DIR=../dist",
        "NEXUS_ALLOWED_ORIGINS=http://localhost:9900",
        "NEXUS_TRUST_PROXY=false",
        "NEXUS_MCP_ORIGIN=http://localhost:9900",
        "NEXUS_DB_POOL_MAX=20",
        "NEXUS_QUERY_TIMEOUT_MS=15000",
        "NEXUS_RATE_LIMIT_PER_MINUTE=120",
        "NEXUS_MAX_BODY_BYTES=5242880",
    ]

    with open(".env", "w") as f:
        f.write("\n".join(lines) + "\n")

    with open(".env", "r") as f:
        for line in f:
            line = line.rstrip()
            if "DATABASE_URL" in line or "NEXUS_API" in line:
                print(f"OK: {line[:80]}")
    print("DONE")

if __name__ == "__main__":
    main()
