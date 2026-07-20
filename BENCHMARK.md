# NEXUS 2.0 Performance Benchmarks

## Memory Operations

| Operation | Target | Current |
|-----------|--------|---------|
| Memory Create | < 10ms | - |
| Memory Recall (100 items) | < 50ms | - |
| Memory Recall (1000 items) | < 200ms | - |
| Brain Export | < 500ms | - |
| Brain Import | < 1000ms | - |

## LLM Operations

| Operation | Target | Current |
|-----------|--------|---------|
| LLM Call (simple) | < 500ms | - |
| LLM Call (complex) | < 2000ms | - |
| Embedding Generation | < 100ms | - |

## System Operations

| Operation | Target | Current |
|-----------|--------|---------|
| Server Health | < 10ms | - |
| API Response (p95) | < 100ms | - |
| Database Query | < 50ms | - |

## How to Run Benchmarks

```bash
cd server
npm run benchmark
```

## Performance Monitoring

The `/api/v1/metrics` endpoint exposes Prometheus metrics for monitoring:

- HTTP request duration
- Database query duration
- LLM call duration
- Memory usage
- Cache hit/miss ratios
