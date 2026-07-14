# Quiz Engine API

Backend API implementation for the SiGMA NodeJS Developer Challenge.

The normative product and engineering specification is [docs/PRD.md](/opt/levian/apps/QuizEngine/docs/PRD.md). Approved ADRs in [docs/decisions](/opt/levian/apps/QuizEngine/docs/decisions) record implementation decisions subordinate to the PRD.

## Stack

- Node.js `24.18.0`
- NestJS modular monolith
- PostgreSQL 16
- Prisma ORM
- JWT authentication with Argon2id password hashing
- Jest and Supertest
- Docker Compose for local API and database execution

## Local Setup

```bash
nvm use
npm ci
docker compose up -d postgres
npx prisma migrate deploy
npm run seed
npm run start:dev
```

The API listens on `PORT` and uses the global prefix `/api/v1`. Swagger UI is available at `/api/docs`, with JSON at `/api/docs-json`.

## Environment

Use `.env` values equivalent to:

```bash
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://quiz:quiz@localhost:5432/quiz_dev
CORS_ORIGINS=http://localhost:3000
JWT_SECRET=local-development-secret-at-least-32-chars
JWT_EXPIRES_IN=3600
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=AdminPass123!
```

Demo credentials created by the seed script are development-only:

- Admin: `admin@example.com` / `AdminPass123!`
- User: `user@example.com` / `UserPass123!`

Do not use these credentials or secrets outside local development and demo containers.

## Useful Commands

```bash
npm run format
npm run lint
npm run typecheck
npm run test
npm run test:e2e
env -i PATH="$PATH" HOME="$HOME" npm run test:e2e
npm run build
docker compose up --build -d
```

Destructive Prisma reset is guarded by `scripts/safe-prisma-reset.js` and must only run against a verified local development database.

## Health Checks

- `GET /api/v1/health/live` confirms the API process is running.
- `GET /api/v1/health/ready` confirms PostgreSQL connectivity and returns `503 SERVICE_NOT_READY` when the database is unreachable.

Liveness is intentionally shallow so orchestrators can tell whether the process exists. Readiness checks dependencies so traffic is only sent to an instance that can serve database-backed requests.

## Architecture

The application is a modular monolith. HTTP controllers, DTOs, guards, pipes, filters, and services live in one NestJS process. Domain boundaries are organized by module:

- `auth`: registration, login, `/auth/me`, JWT issuance, and password hashing.
- `users`: user persistence helpers.
- `quizzes`: admin quiz/question management and user quiz catalog projection.
- `attempts`: start/resume, retakes, snapshots, lazy expiry, atomic submission, scoring, and history.
- `infrastructure`: configuration, database access, and health checks.
- `common`: cross-cutting auth decorators/guards, error envelopes, logging, pagination, UUID validation, and Swagger DTOs.

See [docs/architecture.md](/opt/levian/apps/QuizEngine/docs/architecture.md) for more detail.

## Quiz Content Strategy

Published quizzes are immutable. Draft quiz content can be edited until publication; after publication, content edits and question changes return `409 PUBLISHED_QUIZ_IMMUTABLE`. Archiving blocks new attempts without changing existing attempts or history.

When an attempt starts, the application stores a question snapshot on the attempt row. The snapshot includes answer keys for server-side scoring, but user-facing responses project only safe fields and never include `correctOptionIndex`.

Full `QuizVersion` entities are out of scope for this submission.

## Attempt Submission

Submission runs in one database transaction. The state transition uses an atomic conditional update that requires the attempt to belong to the user, remain `IN_PROGRESS`, and not be expired. Answer rows, score fields, and idempotency records are written in the same transaction.

If an `Idempotency-Key` header is provided, successful submit responses are retained for 24 hours. This retention window is an implementation assumption for the submission and is documented in ADR 004.

## Trade-offs

- The snapshot strategy avoids version tables while preserving reproducible attempt scoring.
- Lazy expiry avoids schedulers and background workers but means status changes occur on read/start/submit/history access.
- The API is backend-only; no frontend is included by design.
- PostgreSQL partial unique indexes require raw SQL migrations because Prisma schema syntax cannot express the open-attempt uniqueness constraint directly.

## Limitations

- No password reset, email verification, refresh tokens, or external identity provider.
- No quiz version publishing workflow beyond immutable published content.
- No background cleanup job for expired idempotency records.
- No frontend, analytics, or admin import/export tooling.

## Future Improvements

- Add explicit quiz version entities if product requirements require editable published content.
- Add scheduled retention cleanup for idempotency records and old attempt data.
- Add refresh-token rotation and account recovery flows.
- Add richer audit logging for administrative changes.

## Development Process

This project was developed using an AI-assisted engineering workflow. The specification, architectural boundaries, acceptance criteria, and review gates were defined before implementation. AI coding agents were used to accelerate implementation, while all design decisions, security constraints, tests, and final code were reviewed and validated by the author.
