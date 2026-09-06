# NIRAMAYA SETU — PHASE 3: SECURITY REMEDIATION REPORT

**Date**: September 6, 2026  
**Status**: REMEDIATION VERIFIED  
**Scope**: Fastify Backend (`C:\Users\fremi\niramaya- setu  backend`) & Next.js Frontend (`C:\Users\fremi\niramaya-setu`)  

---

## 1. Executive Summary

Phase 3 Advanced Security Hardening has been implemented across the backend and frontend services. All previously enforced controls (SEC-01 through SEC-08) remain active, and 5 new security layers have been added:
1. **Server-Side Token Revocation & Session Management** (`SessionManager`).
2. **Offline Envelope Encryption (AES-256-GCM + PBKDF2)** (`OfflineCryptoProvider`).
3. **Sync Anti-Replay & Stale Timestamp Sanitization** (`SyncService`).
4. **Tamper-Evident Cryptographic Hash-Chain Audit Logging** (`SecurityAuditLogger`).
5. **Deterministic Rule-Based Anomaly Detection** (`AnomalyDetector`).

---

## 2. Detailed Remediation Matrix

| Finding ID | Severity | Threat / Vulnerability | Remediation Applied | Test Verification | Residual Risk / Infrastructure Requirements |
|---|---|---|---|---|---|
| **SEC3-01** | High | Lack of server-side session invalidation on logout | Added `SessionManager` token blacklist & user-wide issuance invalidation | `test/phase3-security.test.ts` (Tests 1-3) | Multi-node deployments require Redis backing store (already abstracted via in-memory/Redis fallback) |
| **SEC3-02** | High | Plaintext storage of offline patient vitals & queues | Implemented AES-256-GCM envelope encryption with PBKDF2 salt & unique 12-byte IVs (`OfflineCryptoProvider`) | `test/phase3-security.test.ts` (Tests 4-9) | Field worker PIN strength (mitigated via 100k iteration PBKDF2 salt) |
| **SEC3-03** | High | Offline sync mutation replay & identity spoofing | Added 30-day stale window check and explicit stripping of client-supplied `registeredById`/`originatingWorkerId`/`role` | `test/phase3-security.test.ts` (Tests 10, 12), `SyncService` | Clock drift on client devices beyond 1-hour tolerance |
| **SEC3-04** | High | Unverifiable audit logs vulnerable to silent modification | Created append-only cryptographic hash chain ($H_n = \text{SHA256}(H_{n-1} + \text{canonicalEvent})$) with automated PII redaction | `test/phase3-security.test.ts` (Tests 10-12) | Direct DBA drop table attack (requires WORM / remote SIEM forwarding in production) |
| **SEC3-05** | Medium | Silent brute force & patient enumeration | Implemented deterministic sliding-window `AnomalyDetector` tracking failed logins, scraping, and BOLA probes | `test/phase3-security.test.ts` (Tests 13-16) | Distributed slow brute-force under 5-attempt/5min threshold |
| **SEC3-06** | Medium | Oversized array/payload Denial of Service | Enforced length limits on symptom items (max 500 chars) and max array sizes in `CalculateTriageSchema` | DAST Probe 07 (HTTP 400 rejection) | None |

---

## 3. Architecture Breakdown

### A. Session Architecture
- **Bearer Token & Revocation**: JWTs are verified via Fastify JWT. Upon explicit logout (`POST /api/v1/auth/logout`), the token hash is stored with TTL in `SessionManager`. Any subsequent request with the revoked token immediately fails with HTTP 401.

### B. Offline Data Encryption
- **AES-256-GCM Envelope**: Every offline item is encrypted using a unique random 16-byte salt and 12-byte IV. The key is derived using 100,000 rounds of PBKDF2-HMAC-SHA256. The payload format is versioned (`version: 1`). Any modification to ciphertext or authentication tag fails decryption with an authentication error.

### C. Sync Anti-Replay
- **Idempotency & Timestamps**: The server rejects mutations with timestamps older than 30 days or more than 1 hour in the future. All client-supplied ownership fields (`registeredById`, `originatingWorkerId`, `role`, `facilityId`) are stripped from payloads and authoritatively populated from the authenticated JWT.

### D. Security Audit Logging
- **Cryptographic Hash Chain**: Every security-relevant event contains `previousHash` and `currentHash`. `verifyChainIntegrity()` mathematically validates that no past logs have been tampered with or omitted.

### E. Anomaly Detection
- **Rule-Based Heuristics**:
  - `ANOMALY-001` (HIGH): $\ge 5$ failed logins within 5 minutes.
  - `ANOMALY-002` (MEDIUM): Login success immediately after $\ge 3$ consecutive failures.
  - `ANOMALY-003` (HIGH): Rapid access to $\ge 20$ distinct patient records within 60 seconds.
  - `ANOMALY-004` (CRITICAL): $\ge 3$ BOLA/authorization violations within 5 minutes.
