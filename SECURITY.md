# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 2.0.x   | :white_check_mark: |
| < 2.0   | :x:                |

## Reporting a Vulnerability

We take security vulnerabilities seriously. If you discover a vulnerability in Nexus Agentic OS, please report it responsibly:

1. **Do NOT open a public GitHub issue** for security vulnerabilities.
2. Email your findings to the maintainers (see repository settings for contact).
3. Include: steps to reproduce, affected versions, and potential impact.
4. We will acknowledge receipt within 48 hours and provide a fix timeline.

## Security Architecture

Nexus Agentic OS implements defense-in-depth:

- **Authentication**: API keys with bcrypt hashing, constant-time comparison
- **Authorization**: Ring-based access control (personal → interactive → background → maintenance)
- **Rate Limiting**: Per-IP rate limiting on all API routes
- **Audit Logging**: Hash-chained, tamper-evident audit trail with SHA-256
- **Input Validation**: Zod schemas on all API inputs, guardrails for SQL injection / PII / prompt injection
- **CSP**: Content Security Policy without `unsafe-eval` in Tauri builds
- **Secrets**: Environment variables only; never committed to source control
- **Kill Switch**: Emergency mutation blocking via HTTP 423

## Known Hardening Steps for Production

1. Set `NEXUS_TRUST_PROXY=false` unless behind a trusted reverse proxy
2. Rotate `NEXUS_API_KEY` regularly
3. Enable `NEXUS_RATE_LIMIT_PER_MINUTE` appropriate for your load
4. Use HTTPS in production (configure reverse proxy)
5. Restrict `NEXUS_ALLOWED_ORIGINS` to your actual domain
