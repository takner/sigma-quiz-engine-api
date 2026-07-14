# Architecture

Quiz Engine is a backend-only NestJS modular monolith backed by PostgreSQL and Prisma.

## Runtime Shape

One API process owns HTTP routing, validation, authentication, authorization, domain services, persistence access, health checks, and Swagger documentation. The repository intentionally does not include a frontend, worker process, message broker, scheduler, Redis cache, GraphQL layer, or microservice split.

## Module Boundaries

- `auth` handles registration, login, `/auth/me`, JWT signing, and Argon2id password hashing.
- `users` centralizes user persistence lookups and creation.
- `quizzes` owns draft quiz CRUD, question CRUD, publishing, archiving, safe delete, admin projections, and user catalog projections.
- `attempts` owns start/resume, retakes, lazy expiry, question snapshots, scoring, idempotent submission, and history.
- `infrastructure` owns environment validation, Prisma setup, database readiness, and health endpoints.
- `common` owns guards, decorators, pipes, pagination, global error shape, request IDs, logging redaction, and Swagger documentation DTOs.

Controllers are thin HTTP boundaries. Services contain application logic and Prisma calls. Cross-module access goes through injected services or Prisma only where the owning service needs transactional control.

## Data Model

The main entities are `User`, `Quiz`, `Question`, `QuizAttempt`, `AttemptAnswer`, and `IdempotencyRecord`.

Published quiz content is immutable. Attempts store `quizTitleSnapshot` and `questionsSnapshot` at start time. The snapshot is the scoring source and remains stable even if the quiz is later archived.

Open attempts are protected by a PostgreSQL partial unique index over `(userId, quizId)` where status is `IN_PROGRESS`. This is represented by a raw SQL migration because Prisma schema syntax cannot model partial indexes.

## Request Flow

Requests pass through request ID middleware, the HTTP logger, Helmet/CORS, global validation pipes, guards, controllers, services, and the global error filter. Errors are returned as:

```json
{
  "statusCode": 400,
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Validation failed.",
    "details": [],
    "requestId": "req_...",
    "timestamp": "2026-07-14T12:00:00.000Z",
    "path": "/api/v1/example"
  }
}
```

`details` is always an array.

## Security Boundaries

JWT authentication protects all non-health and non-authentication endpoints. Role guards split ADMIN and USER capabilities. UUID path and UUID-shaped query parameters are validated at controller boundaries before Prisma receives them.

Correct answers are exposed only through admin quiz-question management responses. User-facing quiz, attempt, submit, and history responses never include `correctOptionIndex`; tests recursively scan response trees for that key.

## Operational Model

`/api/v1/health/live` is process liveness. `/api/v1/health/ready` checks database connectivity and returns `503 SERVICE_NOT_READY` when PostgreSQL is unavailable.

CI and local Docker Compose run PostgreSQL 16, apply Prisma migrations, seed demo data, and run the validation suite against the same API/database assumptions used by local development.
