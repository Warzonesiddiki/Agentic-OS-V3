# Troubleshooting Guide

## Common Issues

### 1. Database Connection Failed

**Symptom:** `Error: connect ECONNREFUSED`

**Solution:**
- Check PostgreSQL is running: `docker compose ps postgres`
- Verify DATABASE_URL in `.env`
- Check network connectivity

### 2. TypeScript Compilation Errors

**Symptom:** `Cannot find module` or type errors

**Solution:**
```bash
cd server
npm install
npm run typecheck
```

### 3. LLM Provider Not Configured

**Symptom:** `LLM provider not configured`

**Solution:**
Set these environment variables:
```bash
NEXUS_LLM_BASE_URL=https://api.openai.com/v1
NEXUS_LLM_API_KEY=your-api-key
NEXUS_LLM_MODEL=gpt-4
```

### 4. Memory Recall Returns Empty

**Symptom:** Recall returns no results

**Solution:**
- Check embeddings are generated: `GET /api/v1/health`
- Verify pgvector extension is installed
- Check token budget is sufficient

### 5. Kill Switch Engaged

**Symptom:** HTTP 423 Locked on all write operations

**Solution:**
```bash
# Disable kill switch
curl -X POST http://localhost:9900/api/v1/safety/kill-switch \
  -H "Authorization: Bearer <key>" \
  -H "Content-Type: application/json" \
  -d '{"enabled": false}'
```

### 6. Docker Build Fails

**Symptom:** Build errors in Dockerfile

**Solution:**
```bash
docker build --no-cache -t nexus:dev .
```

## Getting Help

- Check logs: `docker compose logs -f`
- Run diagnostics: `npm run doctor`
- Create an issue: https://github.com/Warzonesiddiki/Agentic-OS-V3/issues
