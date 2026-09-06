# NIRAMAYA SETU — SECURITY AUDIT EVENT MODEL

**Document Version**: 1.0  
**Status**: APPROVED & ACTIVE  

---

## 1. Purpose & Threat Model

The **Security Audit Event Logger** records critical security, authorization, and data access events across Niramaya Setu in a tamper-evident, append-only cryptographic structure.

### Security Guarantees:
- **Tamper Evidence**: Any modification, insertion, deletion, or reordering of logged events breaks the cryptographic hash chain:
  $$\text{currentHash}_n = \text{SHA-256}(\text{previousHash}_{n-1} + \text{canonicalEvent}_n)$$
- **PII / Healthcare Privacy Protection**: Audit logs **NEVER** store raw 12-digit Aadhaar numbers, ABHA tokens, passwords, JWT bearer tokens, or full clinical consultation notes.
- **Canonical Serialization**: Fields are normalized to deterministic JSON representations prior to hashing.

### Limitations:
- A cryptographic hash chain detects tampering after the fact; it does not by itself prevent a malicious database administrator from dropping or rewriting the entire chain from scratch if stored without remote ledger forwarding / WORM storage.
- In production, log events are forwarded asynchronously to an immutable append-only syslog / SIEM destination.

---

## 2. Canonical Event Schema

```json
{
  "eventId": "UUID-v4",
  "sequenceNumber": 0,
  "timestamp": "2026-09-06T13:30:00.000Z",
  "eventType": "LOGIN_SUCCESS",
  "actorId": "USR-ASHA-001",
  "actorRole": "ASHA",
  "facilityId": "FAC-MH-KSC-01",
  "resourceType": "PATIENT",
  "resourceId": "PAT-2026-1049",
  "result": "SUCCESS",
  "requestId": "req-9a8b7c",
  "clientIp": "192.168.1.10",
  "metadata": {
    "catchmentVillage": "Karjat Rural"
  },
  "previousHash": "0000000000000000000000000000000000000000000000000000000000000000",
  "currentHash": "a1b2c3d4e5f6..."
}
```

---

## 3. Supported Security Event Types

| Event Type | Description | Trigger Location |
|---|---|---|
| `LOGIN_SUCCESS` | Successful user authentication | `POST /auth/login` |
| `LOGIN_FAILURE` | Failed authentication attempt (invalid password/user) | `POST /auth/login` |
| `LOGOUT` | Explicit session termination & token revocation | `POST /auth/logout` |
| `SESSION_REVOKED` | Token revoked via blacklist or user-wide invalidation | `SessionManager` |
| `SESSION_EXPIRED` | Expired JWT presented | `fastifyJwt` preHandler |
| `AUTHORIZATION_FAILURE` | Insufficient role or forbidden action | `authorizeRoles` preHandler |
| `BOLA_ATTEMPT` | Attempted access to out-of-catchment patient/referral | `AccessControlService` |
| `PATIENT_RECORD_ACCESSED` | Read access to sensitive demographic profile | `GET /patients/:id` |
| `PATIENT_HISTORY_ACCESSED` | Read access to clinical history & vitals | `GET /patients/:id/history` |
| `REFERRAL_CREATED` | Creation of referral | `POST /referrals` |
| `REFERRAL_STATUS_UPDATED` | Status transition of referral | `PATCH /referrals/:id/status` |
| `SYNC_MUTATION_PROCESSED` | Successful processing of offline mutation | `POST /sync/push` |
| `SYNC_REPLAY_DETECTED` | Duplicate mutation ID submitted | `SyncService` |
| `SYNC_MUTATION_REJECTED` | Stale or invalid sync mutation | `SyncService` |
| `ANOMALY_DETECTED` | Rule-based behavioral anomaly triggered | `AnomalyDetector` |
