# crypto-suite

## Purpose
Cryptographic primitives shared across the server: AES-256-GCM encrypt/decrypt, SHA-256, HMAC,
constant-time comparison, and HKDF-style key derivation. Pure, dependency-light (Node `crypto`).

## Public exports
- `const CIPHER = 'aes-256-gcm'`, `KEY_LEN = 32`, `IV_LEN = 12`.
- `function genKey(): Buffer`.
- `function sha256(data): string`, `function hmac(data, key): string`.
- `function safeEqual(a, b): boolean`, `function constantTimeEqual(a, b): boolean`.
- `function deriveKey(secret, salt, info): Buffer`.
- `function encrypt(plaintext, key): { iv; tag; ciphertext }`, `function decrypt(cipher, key)`.

## Env vars
None directly.

## Test file
- `server/tests/crypto-suite.test.ts` (round-trip encrypt/decrypt, hmac, constant-time).
