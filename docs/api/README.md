# NEXUS 2.0 API Documentation

## Base URL

```
http://localhost:9900/api/v1
```

## Authentication

All endpoints require an API key in the `Authorization` header:

```
Authorization: Bearer <your-api-key>
```

## Response Format

All responses follow this envelope format:

```json
{
  "ok": true,
  "data": { ... },
  "traceId": "req_xxx"
}
```

Error responses:

```json
{
  "ok": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message"
  },
  "traceId": "req_xxx"
}
```

## Endpoints

### Health

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Server health check |

### Memories

| Method | Path | Description |
|--------|------|-------------|
| GET | `/memories` | List memories |
| POST | `/memories` | Create memory |
| GET | `/memories/:id` | Get memory |
| PATCH | `/memories/:id` | Update memory |
| DELETE | `/memories/:id` | Delete memory |

### Recall

| Method | Path | Description |
|--------|------|-------------|
| GET | `/recall` | Token-budgeted recall |

### Skills

| Method | Path | Description |
|--------|------|-------------|
| GET | `/skills` | List skills |
| POST | `/skills` | Create skill |
| GET | `/skills/:id` | Get skill |
| PATCH | `/skills/:id` | Update skill |
| DELETE | `/skills/:id` | Delete skill |

### Brain

| Method | Path | Description |
|--------|------|-------------|
| GET | `/brain/export` | Export brain |
| POST | `/brain/import` | Import brain |
| POST | `/brain/compress` | Compress brain |

### Audit

| Method | Path | Description |
|--------|------|-------------|
| GET | `/audit` | Verify audit chain |
| GET | `/audit/verify` | Advanced verification |

### Safety

| Method | Path | Description |
|--------|------|-------------|
| GET | `/safety` | Get safety status |
| POST | `/safety/kill-switch` | Toggle kill switch |
