# NIRAMAYA SETU — PHASE 3: ADVANCED SECURITY ARCHITECTURE AUDIT

**Date**: September 6, 2026  
**Status**: ACTIVE AUDIT  
**Scope**: Fastify Backend (`C:\Users\fremi\niramaya- setu  backend`) & Next.js 16 Frontend (`C:\Users\fremi\niramaya-setu`)  

---

## 1. Executive Summary

This architecture audit reviews the current security posture of **Niramaya Setu** across 15 critical security domains following the completion of Phase 1 and Phase 2.

While core authentication, Aadhaar tokenization (HMAC-SHA256), BOLA/IDOR catchment checks, and basic rate limiting are operational, advanced defenses are required for:
1. Server-side session revocation / token blacklisting.
2. Authenticated envelope encryption for offline patient queues and vitals.
3. Strict anti-replay with mutation window tracking and client mutation deduplication.
4. Tamper-evident cryptographic hash-chain audit logging.
5. Deterministic anomaly detection for credential stuffing, patient harvesting, and cross-facility probing.

---

## 2. Evaluation Across 15 Security Domains

### 1. Session/Token Storage & Lifecycle
- **Current State**: JWT access tokens are signed with HMAC-SHA256 (`JWT_SECRET`) and issued with 8-hour expiry. Tokens are carried in `Authorization: Bearer <token>` headers.
- **Vulnerability/Gap**: No server-side session revocation list. If a health worker's device is lost or compromised before token expiry, the token cannot be invalidated server-side without changing `JWT_SECRET`.
- **Remediation**: Implement `SessionManager` providing token revocation tracking (in-memory with Redis fallback), explicit logout blacklisting, and idle timeout tracking.

### 2. Browser & IndexedDB Storage Security
- **Current State**: Frontend stores demo states and cache in web storage. Phase 2 eliminated raw 12-digit Aadhaar storage.
- **Vulnerability/Gap**: Offline queue items in browser storage or IndexedDB are stored in plaintext JSON. An attacker with physical or malware access to the field worker tablet could read offline patient medical histories.
- **Remediation**: Implement `OfflineCryptoProvider` implementing AES-256-GCM envelope encryption with PBKDF2-derived keys and unique IVs for offline cached records.

### 3. Offline Sync Anti-Replay & Tampering
- **Current State**: Sync endpoints validate schema and enforce Catchment area boundaries on health worker IDs.
- **Vulnerability/Gap**: Need explicit in-memory/cache deduplication of `mutationId` within a sliding synchronization window (e.g. 7 days) and strict rejection of stale client timestamps (> 30 days).
- **Remediation**: Add explicit mutation deduplication cache and sync watermark validation in `SyncService`.

### 4. CSRF & CORS Exposure
- **Current State**: API is accessed via Bearer tokens in headers. CORS restricts origins to configured frontends.
- **Analysis**: CSRF is primarily a threat when browsers automatically attach session cookies. For Bearer token APIs, CSRF is inherently mitigated because browsers do not automatically attach custom `Authorization` headers. If cookie transport is enabled, explicit `SameSite=Strict` and custom header verification (`X-Requested-With` or `X-CSRF-Token`) must be enforced.

### 5. Security Audit Logging & Tamper Evidence
- **Current State**: Standard Pino logging outputs JSON logs.
- **Vulnerability/Gap**: No cryptographic tamper-evidence. If logs or database records are modified, there is no mathematical proof of chain integrity.
- **Remediation**: Implement a cryptographic hash-chain audit logger where every security event has $\text{hash}_n = \text{SHA256}(\text{hash}_{n-1} + \text{canonicalEvent})$. Strict PII redaction ensures raw Aadhaar, credentials, or clinical notes are never written to audit trails.

### 6. Anomaly Detection & Threat Monitoring
- **Current State**: Basic rate limiting per IP (`@fastify/rate-limit`).
- **Vulnerability/Gap**: No behavioral anomaly detection tracking failed login spikes, enumeration of patient UUIDs, or unauthorized cross-facility attempts across multiple IPs.
- **Remediation**: Implement a lightweight, deterministic rule-based `AnomalyDetector` tracking sliding window metrics and raising `SECURITY_ALERT` events.

### 7. API Information Leakage & Health Endpoint
- **Current State**: Error handler returns structured JSON without stack traces.
- **Remediation**: Ensure `/health` and swagger documentation do not leak database connection strings, server uptime details, or internal environment parameters in production mode.

---

## 3. Phase 3 Remediation Roadmap

1. **SEC3-01**: Server-Side Session Revocation & Token Blacklist
2. **SEC3-02**: AES-256-GCM Envelope Encryption for Offline Storage (`OfflineCryptoProvider`)
3. **SEC3-03**: Idempotent Sync Anti-Replay & Stale Mutation Protection
4. **SEC3-04**: Cryptographic Hash-Chain Security Audit Logger (`SecurityAuditLogger`)
5. **SEC3-05**: Deterministic Rule-Based Security Anomaly Detector (`AnomalyDetector`)
6. **SEC3-06**: API Hardening & Health Endpoint Sanitization
7. **SEC3-07**: Automated Test Suites (20 Criteria) & Local DAST Simulation
