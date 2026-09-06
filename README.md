# Niramaya Setu - Backend Services

Production-grade, modular, and offline-first backend service for **Niramaya Setu** (निरामय सेतू) — an intelligent rural and semi-urban healthcare referral and patient tracking platform.

---

## 🌟 Key Capabilities

1. **Offline-First Synchronization Engine**: Bi-directional idempotent batch sync (`push`/`pull`) using client-generated UUIDs, watermarks, and audit logging.
2. **Patient Identity & Privacy**: Supports **Aadhaar** (SHA-256 tokenized + masked `XXXX-XXXX-1234` only; raw 12-digit Aadhaar is never persisted) and **ABHA** (14-digit number + `@abdm` address).
3. **Deterministic Clinical Triage**: Explainable rule-based clinical triage engine categorizing cases into `EMERGENCY_RED`, `URGENT_YELLOW`, and `ROUTINE_GREEN` with vital threshold validation.
4. **Intelligent Facility Matching**: Multi-criteria ranking based on geospatial coordinates (Haversine/PostGIS-ready), care tiers (Sub-Center, PHC, CHC, District Hospital), bed capacity, and specialized departments.
5. **Referral Lifecycle & 48-Hour No-Show SLA**: Automated tracking from `DRAFT` → `ISSUED` → `IN_TRANSIT` → `ACKNOWLEDGED` → `COMPLETED`. Automatically flags `NO_SHOW` and creates escalation follow-up tasks for ASHA/ANM workers after 48 hours.
6. **Integration-Ready ABDM & FHIR R4**: HL7 FHIR R4 standard serializers for `Patient`, `ServiceRequest`, `Encounter`, and `Practitioner`, alongside clean ABDM M1-M3 adapter boundaries.
7. **Extensible AI & Marathi Voice Hooks**: Pluggable interfaces for LLM-assisted clinical reasoning and Marathi Speech-to-Text / Text-to-Speech (Bhashini/Indic STT).

---

## 🛠️ Technology Stack

- **Runtime & Framework**: Node.js (v20+) + TypeScript + Fastify
- **Database & ORM**: PostgreSQL 16 + Prisma ORM
- **Queue & Workers**: BullMQ + Redis (with resilient In-Memory fallback for local dev)
- **Security**: Fastify Helmet, CORS, JWT authentication, bcrypt password hashing, PII-redacted logging
- **Validation**: Zod schema validation
- **Documentation**: Swagger OpenAPI 3.0 (`/docs`)

---

## 📁 Project Structure

```
niramaya-setu backend/
├── prisma/
│   ├── schema.prisma              # Complete database schema & enums
│   └── seed.ts                    # Development seed script (Demo health workers, facilities)
├── src/
│   ├── config/                    # Environment & configuration parser
│   ├── plugins/                   # Fastify plugins (CORS, Helmet, JWT, Swagger)
│   ├── common/
│   │   ├── errors/                # Centralized error handler & HTTP error classes
│   │   ├── validation/            # Zod validation helpers
│   │   ├── logger/                # Sanitized logger masking health PII & tokens
│   │   └── types/                 # Shared interfaces and types
│   ├── infrastructure/
│   │   ├── database/              # Resilient Prisma client singleton
│   │   ├── redis/                 # Redis client connection manager
│   │   └── queue/                 # BullMQ & In-Memory SLA alert scheduler
│   ├── modules/
│   │   ├── auth/                  # Authentication & RBAC (ASHA, ANM, DOCTOR, ADMIN)
│   │   ├── patients/              # Patient registry, Aadhaar tokenization, ABHA mapping
│   │   ├── triage/                # Deterministic rule-based clinical triage engine
│   │   ├── facilities/            # Facility catalog & geospatial matching engine
│   │   ├── referrals/             # Referral workflow & status transitions
│   │   ├── alerts/                # 24-hr reminders & 48-hr no-show escalation engine
│   │   ├── sync/                  # Offline-first push/pull sync engine
│   │   ├── fhir/                  # HL7 FHIR R4 resource serializers
│   │   ├── abdm/                  # ABDM M1-M3 integration-ready adapters
│   │   ├── ai/                    # Pluggable AI triage & summary interfaces
│   │   └── voice/                 # Pluggable Marathi STT/TTS voice interfaces
│   ├── routes/
│   │   └── index.ts               # Master route registry (/health & /api/v1/*)
│   ├── app.ts                     # Fastify application factory (buildApp)
│   └── server.ts                  # Server entrypoint & graceful shutdown
├── .env.example
├── package.json
├── tsconfig.json
└── README.md
```

---

## 🚀 Getting Started

### 1. Prerequisites
- Node.js (v20 or higher)
- PostgreSQL (Local or Cloud instance e.g., Supabase / Neon / Docker)
- Redis *(Optional for local development; system gracefully uses in-memory scheduler if Redis is unavailable)*

### 2. Installation
```bash
# Clone or navigate to backend workspace
cd "niramaya-setu backend"

# Install dependencies
npm install
```

### 3. Environment Configuration
Copy the sample environment file:
```bash
cp .env.example .env
```
Update `.env` with your PostgreSQL database connection URL:
```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/niramaya_setu?schema=public"
JWT_SECRET="your_secure_jwt_secret_min_32_characters"
PORT=4000
```

### 4. Database Setup & Migrations
```bash
# Generate Prisma Client
npx prisma generate

# Push schema to PostgreSQL database
npx prisma db push

# (Optional) Seed development data
npm run prisma:seed
```

### 5. Running the Application
```bash
# Start development server with auto-reload
npm run dev

# Or build and run in production mode
npm run build
npm start
```

The server will start at:
- **API Base URL**: `http://localhost:4000`
- **Health Check**: `http://localhost:4000/health`
- **Interactive Swagger Docs**: `http://localhost:4000/docs`

---

## 🔐 Default Development Credentials (Seed Data)

| Role | Username | Password | Assigned Location / Facility |
| :--- | :--- | :--- | :--- |
| **ASHA** | `asha_sunita` | `Password@123` | Karjat Rural Sub-Center |
| **ANM** | `anm_priya` | `Password@123` | Neral Primary Health Center (PHC) |
| **DOCTOR** | `dr_shinde` | `Password@123` | Panvel Community Health Center (CHC) |
| **ADMIN** | `admin_niramaya` | `Password@123` | Raigad District Administration |

---

## 📡 Key API Endpoints (`/api/v1`)

| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :--- |
| `GET` | `/health` | System health & dependency diagnostic | No |
| `POST` | `/api/v1/auth/login` | Authenticate health worker / admin | No |
| `POST` | `/api/v1/patients` | Register patient (Aadhaar hash / ABHA) | Yes (ASHA/ANM/Doc/Admin) |
| `GET` | `/api/v1/patients` | Search & filter registered patients | Yes |
| `GET` | `/api/v1/patients/:id/history` | Patient clinical history (triage & referrals) | Yes |
| `POST` | `/api/v1/triage/calculate` | Compute deterministic triage category | No |
| `POST` | `/api/v1/triage/save` | Evaluate & record triage assessment | Yes |
| `GET` | `/api/v1/facilities/match` | Geospatial facility matching & ranking | No |
| `POST` | `/api/v1/referrals` | Create referral with 48h SLA timer | Yes |
| `GET` | `/api/v1/referrals/pending` | List pending referrals for facility | Yes |
| `PATCH`| `/api/v1/referrals/:id/status` | Update referral status (In-Transit, Done) | Yes |
| `GET` | `/api/v1/referrals/no-shows` | List breached 48h referrals for home visits | Yes |
| `POST` | `/api/v1/sync/push` | Batch upload offline data with client UUIDs | Yes |
| `POST` | `/api/v1/sync/pull` | Fetch incremental deltas since watermark | Yes |
| `GET` | `/api/v1/fhir/Patient/:id` | HL7 FHIR R4 Patient Resource | Yes |
| `GET` | `/api/v1/fhir/ServiceRequest/:id` | HL7 FHIR R4 Referral Resource | Yes |
| `POST` | `/api/v1/abdm/generate-otp` | ABDM M1 Aadhaar OTP Stub | Yes |
| `POST` | `/api/v1/abdm/verify-otp` | ABDM M1 Verify OTP Stub | Yes |
| `POST` | `/api/v1/ai/triage-assist` | Pluggable AI clinical assistance | Yes |
| `POST` | `/api/v1/voice/marathi/stt` | Pluggable Marathi Speech-to-Text | Yes |
| `POST` | `/api/v1/voice/marathi/tts` | Pluggable Marathi Text-to-Speech | Yes |

---

## 🔒 Security & Compliance Principles

1. **Aadhaar Protection**: Raw 12-digit Aadhaar numbers are never stored in plain text or logged. They are salted and tokenized via SHA-256 and stored alongside a masked string (`XXXX-XXXX-1234`).
2. **Sanitized Logs**: The logging layer automatically redacts passwords, tokens, Authorization headers, and sensitive medical fields.
3. **Integration Boundaries**: External integrations (ABDM Gateway, Bhashini STT/TTS, Google Gemini/LLMs) are abstracted behind strict TypeScript interfaces.
