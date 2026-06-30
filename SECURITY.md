# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in NEXUS Agentic OS, please report it privately by opening a GitHub issue with "SECURITY" in the title.

Do **not** disclose security issues publicly until we've had a chance to address them.

## What to Include
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Any suggested fix (optional)

## Scope
- API key management and hashing
- Audit log integrity (tamper-evident chain)
- Input validation and sanitization
- Authentication and authorization
- Cross-origin request handling
- Environment variable exposure

## Response
We'll acknowledge your report within 48 hours and work on a fix. We'll credit you in the release notes if you'd like.

## Best Practices
- Never commit `.env` files — use `.env.example` as template
- Rotate API keys if you suspect a leak
- Enable the kill switch for emergency mutation blocking
