# Niramaya Setu Backend — Security Audit & Threat Assessment

**Date**: September 6, 2026  
**Auditor**: Senior Application Security Engineer  
**Scope**: `C:\Users\fremi\niramaya- setu  backend`  
**Overall Security Status**: **NEEDS HARDENING (HIGH RISK IN MULTI-TENANT DEPLOYMENT)**

---

## Executive Summary

The **Niramaya Setu** backend demonstrates good engineering fundamentals: parameterized Prisma ORM queries preventing SQL injection, strict TypeScript typings, deterministic rule-based clinical triage isolated from AI hallucinations, structured sanitization in logging, and clean abstraction boundaries for external integrations (ABDM, AI, Marathi Voice).

However, because this is a **healthcare application handling sensitive citizen health data, Aadhaar tokens, and emergency referrals**, a rigorous audit revealed **critical authorization (BOLA/IDOR) vulnerabilities, missing rate-limiting/brute-force defenses, cryptographic weaknesses in Aadhaar token hashing, unrestricted offline sync batching, and unconstrained referral state machine manipulation**.

This document outlines every discovered vulnerability and presents a concrete, non-breaking remediation roadmap.

---

## Table of Discovered Vulnerabilities

| Finding ID | Severity | Category | Title | Affected File & Lines |
| :--- | :--- | :--- | :--- | :--- |
| **SEC-01** | **CRITICAL** | BOLA / IDOR | Unrestricted Patient Record & Clinical History Access | `src/modules/patients/patient.routes.ts` (L44-L62)<br>`src/modules/patients/patient.service.ts` (L88-L135) |
| **SEC-02** | **CRITICAL** | BFLA / State Machine | Unauthorized State Transitions & Cancellation of Referrals | `src/modules/referrals/referral.routes.ts` (L54-L64)<br>`src/modules/referrals/referral.service.ts` (L73-L114) |
| **SEC-03** | **CRITICAL** | BOLA / Data Leakage | Unrestricted FHIR R4 Patient & ServiceRequest Exposure | `src/modules/fhir/fhir.routes.ts` (L10-L35)<br>`src/modules/fhir/fhir.service.ts` (L5-L30) |
| **SEC-04** | **HIGH** | Cryptography / Privacy | Static Salt & GPU Rainbow Table Exposure for Aadhaar Tokens | `src/modules/patients/patient.schema.ts` (L5-L8) |
| **SEC-05** | **HIGH** | Mass Assignment / Spoofing | Unchecked Mass Assignment in Offline Sync Push | `src/modules/sync/sync.service.ts` (L39-L50) |
| **SEC-06** | **HIGH** | Data Harvesting | Unrestricted Statewide Data Pull via Offline Sync | `src/modules/sync/sync.service.ts` (L103-L141) |
| **SEC-07** | **HIGH** | Broken Authentication | Lack of Rate Limiting & Account Lockout on Login & OTP Endpoints | `src/modules/auth/auth.routes.ts` (L11-L28)<br>`src/modules/abdm/abdm.routes.ts` (L14-L48) |
| **SEC-08** | **MEDIUM** | Weak Secret Handling | Default Hardcoded JWT Secret Fallback | `src/config/env.ts` (L12, L28-L34) |
| **SEC-09** | **MEDIUM** | Predictable Token | Predictable Referral Codes Generated with `Math.random()` | `src/modules/referrals/referral.service.ts` (L9-L13) |
| **SEC-10** | **MEDIUM** | Security Headers / CORS | Wildcard CORS Reflection & Permissive Security Headers | `src/plugins/cors.ts` (L5-L10)<br>`src/plugins/helmet.ts` (L5-L8) |
| **SEC-11** | **MEDIUM** | Data Integrity | Destructive Cascade Delete on Patient Clinical Records | `prisma/schema.prisma` (L158, L195) |
| **SEC-12** | **LOW** | Info Disclosure | System Topology & Dependency Disclosure on `/health` | `src/routes/index.ts` (L34-L44) |

---

## Detailed Vulnerability Analysis

---

### [SEC-01] Unrestricted Patient Record & Clinical History Access (BOLA / IDOR)

* **Severity**: **CRITICAL**
* **File & Location**: [`src/modules/patients/patient.routes.ts:L44-L62`](file:///c:/Users/fremi/niramaya-%20setu%20%20backend/src/modules/patients/patient.routes.ts#L44-L62), [`src/modules/patients/patient.service.ts:L88-L135`](file:///c:/Users/fremi/niramaya-%20setu%20%20backend/src/modules/patients/patient.service.ts#L88-L135)
* **Why it is a security issue**:
  `GET /api/v1/patients/:id` and `GET /api/v1/patients/:id/history` only verify that the caller is authenticated with a valid JWT. They perform **zero check** on whether the health worker (ASHA/ANM/Doctor) operates in the same village, taluka, or health facility as the patient.
* **Realistic Attack Scenario**:
  A compromised ASHA worker account in Village A or a rogue user iterates through known or intercepted UUIDs to query `/api/v1/patients/<id>/history`, extracting full diagnostic logs, triage ratings, reproductive history, and referrals for citizens across unrelated districts.
* **Recommended Fix**:
  Enforce catchment-area and assigned-facility checks in `patient.service.ts`:
  - `ASHA` / `ANM`: May only view patients registered by them or belonging to their assigned village/taluka.
  - `DOCTOR`: May view patients assigned to their facility or referred to/from their facility.
  - `ADMIN`: District-level scoping.
* **Impact on Functionality**: None if health workers are properly mapped to their operational jurisdiction in seed/auth tokens.

---

### [SEC-02] Unauthorized State Transitions & Cancellation of Referrals (BFLA / Broken State Machine)

* **Severity**: **CRITICAL**
* **File & Location**: [`src/modules/referrals/referral.routes.ts:L54-L64`](file:///c:/Users/fremi/niramaya-%20setu%20%20backend/src/modules/referrals/referral.routes.ts#L54-L64), [`src/modules/referrals/referral.service.ts:L73-L114`](file:///c:/Users/fremi/niramaya-%20setu%20%20backend/src/modules/referrals/referral.service.ts#L73-L114)
* **Why it is a security issue**:
  `PATCH /api/v1/referrals/:id/status` allows **any authenticated user** (even an ASHA in another taluka) to update the status of any referral to `COMPLETED` or `CANCELLED`. Furthermore, the state transitions are completely unconstrained (e.g., a `CANCELLED` referral can be marked `COMPLETED`).
* **Realistic Attack Scenario**:
  An attacker or disgruntled staff member cancels active emergency referrals (`EMERGENCY_RED`). This triggers `queueManager.cancelScheduledAlerts(id)`, completely suppressing the 48-hour No-Show watchdog and leaving critically ill patients without emergency follow-up.
* **Recommended Fix**:
  1. Enforce strict transition rules:
     - `ISSUED` → `IN_TRANSIT` (Originating Worker / Patient)
     - `IN_TRANSIT` / `ISSUED` → `ACKNOWLEDGED` (Destination Facility Doctor only)
     - `ACKNOWLEDGED` → `COMPLETED` (Destination Facility Doctor only)
     - `ISSUED` → `CANCELLED` (Originating Worker or Admin with mandatory reason)
  2. Verify that `request.user.facilityId === referral.destinationFacilityId` for completion/acknowledgement.
* **Impact on Functionality**: Prevents accidental or unauthorized modifications while securing the clinical workflow.

---

### [SEC-03] Unrestricted FHIR R4 Resource Exposure

* **Severity**: **CRITICAL**
* **File & Location**: [`src/modules/fhir/fhir.routes.ts:L10-L35`](file:///c:/Users/fremi/niramaya-%20setu%20%20backend/src/modules/fhir/fhir.routes.ts#L10-L35), [`src/modules/fhir/fhir.service.ts:L5-L30`](file:///c:/Users/fremi/niramaya-%20setu%20%20backend/src/modules/fhir/fhir.service.ts#L5-L30)
* **Why it is a security issue**:
  `GET /api/v1/fhir/Patient/:id` and `GET /api/v1/fhir/ServiceRequest/:id` return standard HL7 FHIR bundles containing demographic, ABHA, and clinical order information without verifying object ownership or consent artifacts.
* **Realistic Attack Scenario**:
  An attacker uses the FHIR endpoints as an easy standardized scraping vector to exfiltrate patient identifiers and healthcare service orders.
* **Recommended Fix**:
  Apply the same resource-level access control policy as internal patient endpoints and prepare for ABDM HIU consent token validation.
* **Impact on Functionality**: None for legitimate healthcare workflows.

---

### [SEC-04] Static Salt & GPU Rainbow Table Exposure for Aadhaar Tokens

* **Severity**: **HIGH**
* **File & Location**: [`src/modules/patients/patient.schema.ts:L5-L8`](file:///c:/Users/fremi/niramaya-%20setu%20%20backend/src/modules/patients/patient.schema.ts#L5-L8)
* **Why it is a security issue**:
  The function `hashAadhaar()` uses a hardcoded salt:
  ```typescript
  const salt = 'niramaya_setu_aadhaar_privacy_salt_2026';
  return crypto.createHash('sha256').update(`${salt}:${rawAadhaar.trim()}`).digest('hex');
  ```
  Indian Aadhaar numbers have only 12 digits, with the final digit being a Verhoeff checksum. The total key space is at most $10^{11}$ combinations. With a static, publicly known salt in source code, an attacker with read access to the database can compute a rainbow table or run GPU brute-force in hours to recover the raw 12-digit Aadhaar number for every patient.
* **Realistic Attack Scenario**:
  A compromised database backup is leaked. The adversary generates hashes of all possible 12-digit numbers using the hardcoded salt and de-anonymizes the entire citizen database.
* **Recommended Fix**:
  1. Move the salt/pepper to an environment variable (`AADHAAR_PEPPER_SECRET`) backed by a KMS/Vault.
  2. Use HMAC-SHA256 with a 256-bit secret key rather than standard string concatenation.
* **Impact on Functionality**: Requires a one-time script to re-hash existing tokens if testing with live data.

---

### [SEC-05] Mass Assignment & Identity Spoofing in Offline Sync Push

* **Severity**: **HIGH**
* **File & Location**: [`src/modules/sync/sync.service.ts:L39-L50`](file:///c:/Users/fremi/niramaya-%20setu%20%20backend/src/modules/sync/sync.service.ts#L39-L50)
* **Why it is a security issue**:
  `processPush` executes `mutation.payload as any` directly into `createPatient`, `saveAssessment`, and `createReferral`. An attacker can inject arbitrary fields like `registeredById`, `originatingFacilityId`, or `syncedAt` in the payload.
* **Realistic Attack Scenario**:
  An ASHA worker client submits a sync batch that claims a referral was created by a Senior Medical Officer at the District Hospital, creating falsified medical paper trails.
* **Recommended Fix**:
  1. Validate each mutation payload through its respective Zod schema (`CreatePatientSchema`, `CalculateTriageSchema`, `CreateReferralSchema`).
  2. Forcefully override ownership fields (`registeredById`, `originatingWorkerId`, `originatingFacilityId`) using the verified `request.user` claims.
* **Impact on Functionality**: None. Enhances audit integrity.

---

### [SEC-06] Unrestricted Statewide Data Harvesting via Offline Sync Pull

* **Severity**: **HIGH**
* **File & Location**: [`src/modules/sync/sync.service.ts:L103-L141`](file:///c:/Users/fremi/niramaya-%20setu%20%20backend/src/modules/sync/sync.service.ts#L103-L141)
* **Why it is a security issue**:
  `POST /api/v1/sync/pull` allows the caller to omit the `village` filter parameter. When omitted, Prisma queries `Patient`, `TriageAssessment`, and `Referral` across all locations with no worker jurisdiction boundaries.
* **Realistic Attack Scenario**:
  An attacker steals an ASHA worker's tablet or extracts the JWT and issues `POST /api/v1/sync/pull` with `lastSyncWatermark: "1970-01-01"` and `limit: 10000`, pulling down all patient records, triage scores, and referrals in the database.
* **Recommended Fix**:
  If the requesting user is an `ASHA` or `ANM`, restrict the query `WHERE` clause to their assigned village/taluka regardless of client input.
* **Impact on Functionality**: Ensures offline syncing delivers only relevant local catchment data to field tablets.

---

### [SEC-07] Lack of Rate Limiting & Account Lockout on Login & OTP Endpoints

* **Severity**: **HIGH**
* **File & Location**: [`src/modules/auth/auth.routes.ts:L11-L28`](file:///c:/Users/fremi/niramaya-%20setu%20%20backend/src/modules/auth/auth.routes.ts#L11-L28), [`src/modules/abdm/abdm.routes.ts:L14-L48`](file:///c:/Users/fremi/niramaya-%20setu%20%20backend/src/modules/abdm/abdm.routes.ts#L14-L48)
* **Why it is a security issue**:
  No rate-limiting middleware is enabled on `/api/v1/auth/login`, `/api/v1/abdm/generate-otp`, or `/api/v1/abdm/verify-otp`.
* **Realistic Attack Scenario**:
  1. An attacker executes dictionary brute-force attacks against health worker usernames (`asha_sunita`, `dr_shinde`).
  2. An attacker spams the OTP generation route to exhaust SMS credits and inflict denial of service on legitimate users.
* **Recommended Fix**:
  Register `@fastify/rate-limit` globally with strict route-specific limits on auth/OTP endpoints (e.g., 5 failed attempts per 15 minutes per IP/username).
* **Impact on Functionality**: None for normal users; thwarts automated bots and password spraying.

---

### [SEC-08] Default Hardcoded JWT Secret Fallback

* **Severity**: **MEDIUM**
* **File & Location**: [`src/config/env.ts:L12, L28-L34`](file:///c:/Users/fremi/niramaya-%20setu%20%20backend/src/config/env.ts#L12)
* **Why it is a security issue**:
  If `JWT_SECRET` is missing in `.env`, the system defaults to a hardcoded fallback string. If deployed to staging or production without a custom `.env`, anyone who reads the source code can forge valid JWT tokens with `ADMIN` privileges.
* **Realistic Attack Scenario**:
  An administrator deploys the container into a Kubernetes cluster forgetting to mount the secret. An attacker uses `super_secret_jwt_key_min_32_characters_for_niramaya_setu` to sign their own Admin token and assumes complete control.
* **Recommended Fix**:
  In `src/config/env.ts`, enforce that in `NODE_ENV === 'production'`, startup immediately throws a fatal error if `JWT_SECRET` is missing, short, or matches the default placeholder.
* **Impact on Functionality**: Prevents insecure production deployments.

---

### [SEC-09] Predictable Referral Codes Generated with `Math.random()`

* **Severity**: **MEDIUM**
* **File & Location**: [`src/modules/referrals/referral.service.ts:L9-L13`](file:///c:/Users/fremi/niramaya-%20setu%20%20backend/src/modules/referrals/referral.service.ts#L9-L13)
* **Why it is a security issue**:
  Referral codes are generated as:
  ```typescript
  const randomHex = Math.floor(1000 + Math.random() * 9000);
  return `REF-${dateStr}-${randomHex}`;
  ```
  `Math.random()` is not cryptographically secure, and there are only 9,000 possible 4-digit codes per day.
* **Realistic Attack Scenario**:
  An attacker enumerates `REF-20260906-1000` through `REF-20260906-9999` to intercept and manipulate patient referral transfers.
* **Recommended Fix**:
  Use `crypto.randomBytes(4).toString('hex').toUpperCase()` to produce a high-entropy identifier e.g. `REF-20260906-7F3A9D21`.
* **Impact on Functionality**: None. Codes remain easy to read while being non-guessable.

---

### [SEC-10] Wildcard CORS Reflection & Permissive Security Headers

* **Severity**: **MEDIUM**
* **File & Location**: [`src/plugins/cors.ts:L5-L10`](file:///c:/Users/fremi/niramaya-%20setu%20%20backend/src/plugins/cors.ts#L5-L10), [`src/plugins/helmet.ts:L5-L8`](file:///c:/Users/fremi/niramaya-%20setu%20%20backend/src/plugins/helmet.ts#L5-L8)
* **Why it is a security issue**:
  `cors` has `origin: true`, reflecting any requesting Origin header with `credentials: true`. `helmet` disables CSP (`contentSecurityPolicy: false`).
* **Realistic Attack Scenario**:
  A malicious website visited by a health worker performs cross-origin authenticated API requests to trigger referrals or read patient records using the browser's credentials.
* **Recommended Fix**:
  Configure an explicit CORS whitelist matching trusted frontend origins (e.g. `http://localhost:5173`, production domain) and enable sensible CSP directives.
* **Impact on Functionality**: None when authorized frontend domains are configured.

---

### [SEC-11] Destructive Cascade Delete on Patient Clinical Records

* **Severity**: **MEDIUM**
* **File & Location**: [`prisma/schema.prisma:L158, L195`](file:///c:/Users/fremi/niramaya-%20setu%20%20backend/prisma/schema.prisma#L158)
* **Why it is a security issue**:
  `TriageAssessment` and `Referral` models use `onDelete: Cascade` referencing `Patient`. Accidental or malicious patient deletion permanently destroys medical history, SLA records, and audit chains.
* **Realistic Attack Scenario**:
  An administrative mistake triggers a patient record deletion, permanently wiping out legal medical evidence and referral trail data.
* **Recommended Fix**:
  Change `onDelete: Cascade` to `onDelete: Restrict` and implement soft deletes (`isDeleted: Boolean`, `deletedAt: DateTime`).
* **Impact on Functionality**: Protects healthcare data integrity and regulatory compliance.

---

### [SEC-12] System Topology & Dependency Disclosure on `/health`

* **Severity**: **LOW**
* **File & Location**: [`src/routes/index.ts:L34-L44`](file:///c:/Users/fremi/niramaya-%20setu%20%20backend/src/routes/index.ts#L34-L44)
* **Why it is a security issue**:
  `GET /health` is unauthenticated and returns internal architecture details (e.g. Redis connection state, stub statuses).
* **Recommended Fix**:
  Return a simple `{"status": "ok"}` on public `/health` and move detailed dependency diagnostics behind an Admin authentication check (`GET /api/v1/system/health`).
* **Impact on Functionality**: None. Standard health probes (Kubernetes/AWS ALB) only inspect HTTP 200.

---

## Threat Model (Attack Path Matrix)

```
[Attacker] ──► Entry Point ──► Vulnerability ──► Target Asset ──► Impact
```

| Actor | Entry Point | Vulnerability | Asset | Impact |
| :--- | :--- | :--- | :--- | :--- |
| **Rogue / Phished Health Worker** | `GET /api/v1/patients/:id/history` | SEC-01 (BOLA) | Citizen Medical History | Statewide Patient Privacy Breach |
| **Unauthorized User** | `PATCH /api/v1/referrals/:id/status` | SEC-02 (BFLA) | Active Emergency Referrals | SLA watchdog canceled; delayed medical intervention |
| **Database Leaker** | `patients.aadhaar_token` | SEC-04 (Static Salt) | Aadhaar Identity | Mass de-anonymization via GPU brute-force |
| **Malicious Sync Client** | `POST /api/v1/sync/push` | SEC-05 (Mass Assignment)| Sync Audit Log & Referrals | Falsification of medical records under doctor IDs |
| **Unauthenticated Bot** | `POST /api/v1/auth/login` | SEC-07 (No Rate Limit) | Worker Credentials | Account takeover via credential spraying |

---

## Prioritized Remediation Roadmap

### 🔴 P0 — Fix Immediately (Critical Security & Access Controls)
1. **Fix BOLA on Patient Records**: Scope `getPatients`, `getPatientById`, and `getPatientHistory` to the authenticated worker's assigned village/facility.
2. **Harden Referral Status Transitions**: Restrict `PATCH /api/v1/referrals/:id/status` to destination hospital staff with strict state machine validation.
3. **Fix BOLA on FHIR Endpoints**: Apply jurisdictional authorization checks to FHIR resource lookups.
4. **Harden Aadhaar Hashing**: Switch from static salt string concatenation to an environment-configured HMAC-SHA256 secret.

### 🟠 P1 — Fix Before Production (Abuse Prevention & Input Validation)
1. **Add Rate Limiting**: Register `@fastify/rate-limit` across `/api/v1/auth/login` and `/api/v1/abdm/*`.
2. **Harden Sync Push**: Validate each mutation payload with strict Zod schemas and enforce caller identity.
3. **Scope Sync Pull**: Force village/catchment filtering based on worker profile in `processPull`.
4. **Secure Referral Codes**: Replace `Math.random()` with `crypto.randomBytes(4)`.
5. **Enforce Strict Production Config**: Terminate boot if `JWT_SECRET` is unset in production mode.

### 🟡 P2 — Defense-in-Depth
1. **Configure CORS & Security Headers**: Whitelist specific frontend origins; tighten CSP directives.
2. **Replace Cascade Deletes**: Use `onDelete: Restrict` and implement soft deletes for patient records.
3. **Sanitize Public Health Endpoint**: Limit unauthenticated `/health` output to `{ status: "ok" }`.

### 🔵 P3 — Future Advanced Security (Enterprise & Compliance)
1. **Token Revocation & Refresh Tokens**: Implement short-lived access tokens (15m) + rotatable refresh tokens in Redis.
2. **ABDM Production Compliance**: Implement RSA-256 decryption of ABHA health data and verify Consent Artifacts for FHIR exchange.
