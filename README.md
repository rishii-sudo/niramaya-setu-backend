# Niramaya Setu — Backend Services

Backend services for **Niramaya Setu**, an offline-first healthcare referral and care-continuity platform.

> **Status:** Local development / prototype. PostgreSQL is integrated; ABDM, AI and voice services are currently configurable adapters/stubs.

## Core Capabilities

- JWT authentication and role-aware API access
- Patient, referral, appointment and follow-up workflows
- Healthcare facility and specialist discovery
- Offline-first support with development fallbacks
- PostgreSQL database with Prisma ORM
- Redis/BullMQ support with in-memory development fallback
- Helmet, CORS, rate limiting and request validation
- Pluggable ABDM, AI and Marathi/Indic voice adapters
- OpenAPI/Swagger API documentation
- Automated and security-focused backend tests

## Technology Stack

| Component | Technology |
|---|---|
| Runtime | Node.js |
| Language | TypeScript |
| API | Fastify |
| Database | PostgreSQL |
| ORM | Prisma |
| Authentication | JWT + bcrypt |
| Queue | BullMQ + Redis |
| Validation | Zod |
| API Docs | OpenAPI / Swagger |
| Security | Helmet, CORS, Rate Limiting |

## Project Structure

```text
niramaya-setu-backend/
├── prisma/
│   ├── migrations/
│   ├── schema.prisma
│   └── seed.ts
├── src/
│   ├── common/
│   ├── config/
│   ├── infrastructure/
│   ├── modules/
│   ├── plugins/
│   ├── routes/
│   └── security/
├── test/
├── scripts/
├── .env.example
├── package.json
├── tsconfig.json
└── README.md
```

## Local Setup

### 1. Prerequisites

Install Node.js, Docker Desktop and Git.

### 2. Install dependencies

```powershell
npm install
```

### 3. Configure environment

Create `.env` from `.env.example`.

Example local database configuration:

```env
PORT=4000
HOST=0.0.0.0
NODE_ENV=development
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/niramaya_setu?schema=public
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=
```

**Never commit `.env`, real API keys, passwords, JWT secrets or patient data.**

### 4. Start PostgreSQL with Docker

```powershell
docker run -d `
  --name niramaya-postgres `
  -e POSTGRES_USER=postgres `
  -e POSTGRES_PASSWORD=postgres `
  -e POSTGRES_DB=niramaya_setu `
  -p 5432:5432 `
  postgres:16
```

Check:

```powershell
docker ps
```

### 5. Prisma

```powershell
npx prisma generate
npx prisma migrate dev
```

Check migration state:

```powershell
npx prisma migrate status
```

### 6. Build and run

```powershell
npm run build
npm start
```

The local API runs at:

```text
http://localhost:4000
```

Health check:

```text
http://localhost:4000/health
```

Swagger documentation:

```text
http://localhost:4000/docs
```

## Development Mode

```powershell
npm run dev
```

## Useful Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Development server with reload |
| `npm run build` | Compile TypeScript |
| `npm start` | Start compiled backend |
| `npm test` | Run tests |
| `npm run typecheck` | Type-check without emitting |
| `npm run prisma:generate` | Generate Prisma Client |
| `npm run prisma:migrate` | Run Prisma migrations |
| `npm run prisma:seed` | Seed development data |

## Integration Architecture

External services are kept behind configurable adapters.

### ABDM

ABDM integration currently supports sandbox/stub configuration. Production credentials and integration validation are still required.

### AI

```env
AI_PROVIDER=stub
AI_API_KEY=
```

The provider can be replaced without restructuring the core API.

### Voice

```env
VOICE_PROVIDER=stub
VOICE_API_KEY=
```

The current architecture supports a Marathi/Indic voice provider adapter.

## Security

Security is implemented as a backend concern, including:

- JWT authentication
- Password hashing
- Request validation
- Security headers
- CORS controls
- Rate limiting
- Role-aware authorization
- Structured security/event logging
- Security-focused testing

Before production deployment, replace development secrets, configure production CORS/rate limits, secure PostgreSQL and Redis, replace integration stubs, and perform a final privacy/security review.

## Redis Behaviour

Redis/BullMQ is supported for queue processing. During local development, supported functionality can fall back to an in-memory implementation when Redis is unavailable.

For production, Redis should be configured and monitored rather than relying on the development fallback.

## Frontend Integration

The frontend communicates with this backend through the HTTP API.

Local base URL:

```text
http://localhost:4000
```

Use environment variables for API URLs instead of hard-coding production endpoints.

## Prototype Boundaries

A successful local health check does not mean every external healthcare integration is production-ready. ABDM, AI and voice providers currently depend on their configured adapters/stubs and require separate production integration work.

## GitHub

Before committing:

```powershell
git status
git diff
```

Then:

```powershell
git add README.md
git commit -m "docs: update backend README"
git push origin main
```

## License

This project is licensed under the MIT License.