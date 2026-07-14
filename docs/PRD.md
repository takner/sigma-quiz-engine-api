---
title: "SiGMA NodeJS Developer Challenge — Quiz Engine API"
subtitle: "Implementation PRD for Claude Code"
author: "Kian Kiaei"
date: "Version 1.1 — Final Pre-Implementation"
lang: en-US
---

# Document Control

| Field | Value |
|---|---|
| Status | Approved for implementation — content strategy locked |
| Primary consumer | Claude Code |
| Secondary consumers | Candidate, technical reviewer, interview panel |
| Delivery target | GitHub repository with runnable API, tests, documentation, and CI |
| Source assignment | SiGMA NodeJS Developer Challenge: Quiz Engine API |
| Architecture | Production-oriented modular monolith |
| Quiz content strategy | Immutable published quizzes + per-attempt question snapshots (locked in v1.1) |
| Preferred stack | Node.js, TypeScript, NestJS, PostgreSQL, Prisma |

Changes in v1.1: the Quiz Versioning decision gate is removed and the snapshot strategy is locked; retake policy (BR-51) is added; specification precedence is defined; AI-assisted development transparency policy replaces commit-message concealment; environment safety, CI database, and demo seed requirements are added; all `QuizVersion` entities and references are removed from the normative model.

Phase 0 binding resolutions amend and clarify this PRD. Where an older example or sample conflicts with these resolutions, the resolution below is authoritative.

# 1. Purpose, Normative Language, and Precedence

This PRD converts the short assignment into an explicit, testable implementation contract. Claude Code MUST follow this document instead of improvising unspecified behavior.

The keywords **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT**, and **MAY** are normative:

- **MUST / MUST NOT**: mandatory for acceptance.
- **SHOULD / SHOULD NOT**: expected unless a documented technical reason prevents it.
- **MAY**: optional and must not jeopardize mandatory scope.

The source assignment requires a backend API in which administrators manage quizzes and questions, users register and authenticate, users take quizzes, results are calculated, and quiz history is stored. The assignment also values TypeScript, tests, Swagger/OpenAPI, retakes, time limits, clean modular code, and a structure that can later be separated into microservices.

## 1.1 Specification Precedence

`docs/PRD.md` is the single normative source of truth.

Precedence order:

1. `docs/PRD.md`
2. Approved ADRs
3. `CLAUDE.md`
4. Implementation code and migrations

`prisma/schema.prisma` and `prisma/migrations/*` are executable implementation artifacts of this specification, not parallel specifications. No separate schema-template, SQL-template, or commit-plan file may be maintained as a parallel source of truth.

Any contradiction or missing requirement discovered during implementation MUST be reported to the operator. It MUST NOT be resolved through autonomous assumption.

## 1.2 Binding Operator Resolutions

The following decisions are approved amendments to this PRD:

1. Five ADR placeholders MUST exist:
   - `001-modular-monolith.md`
   - `002-postgresql-and-prisma.md`
   - `003-immutable-published-quizzes-and-attempt-snapshots.md`
   - `004-atomic-attempt-submission.md`
   - `005-correct-answer-defense-in-depth.md`
2. `correctOptionIndex` MUST never appear in any user-facing response, including successful submit results and history. This overrides any older PRD sample containing `correctOptionIndex` in a user-facing response. Successful submission MUST satisfy the correct/incorrect breakdown requirement with `questionId`, nullable `selectedOptionIndex`, `answered`, `isCorrect`, aggregate `score`, `totalQuestions`, and `percentage`.
3. Public registration MUST reject any submitted `role` property with HTTP `400` and code `VALIDATION_ERROR`. DTO whitelisting MUST reject unknown properties; registration MUST NOT silently ignore `role`.
4. `@nestjs/throttler` is approved for basic in-memory rate limiting on registration and login only. Redis or distributed rate-limit storage MUST NOT be added.
5. Validation bounds are exact:
   - password: 8-128 characters;
   - quiz title: 3-120 characters;
   - quiz description: nullable, maximum 1000 characters;
   - question text: 3-500 characters;
   - options: 2-10 entries;
   - each option: 1-300 characters after trimming;
   - `correctOptionIndex`: integer within the options array;
   - `timeLimitSeconds`: nullable; when present, 60-86400 seconds;
   - pagination limit: default 20, maximum 100.
   Duplicate, empty, or whitespace-only options MUST be rejected.
6. Deterministic default ordering MUST be:
   - user-visible published quiz list: `publishedAt DESC`;
   - admin quiz list: `updatedAt DESC`;
   - quiz questions: `position ASC`;
   - user attempt history: `startedAt DESC`;
   - answer breakdown: snapshot question order.
7. Role access is exact:
   - `/auth/me`: any authenticated account;
   - admin quiz/question management: `ADMIN` only;
   - user quiz listing, attempt start, attempt submit, attempt result, and history: `USER` only.
   An admin MUST NOT bypass user attempt ownership or use user attempt endpoints merely because the account is an admin.
8. Partial submissions are allowed. Unanswered questions count as incorrect. Omitted answers MUST NOT create `AttemptAnswer` rows. The response breakdown MUST still include every snapshot question with `selectedOptionIndex: null`, `answered: false`, and `isCorrect: false` for omitted questions.
9. `AttemptStatus` supports only `IN_PROGRESS`, `SUBMITTED`, and `EXPIRED`. `CANCELLED` MUST NOT be modeled or implemented.
10. Admin creation is provided through development/test seed only. The seed MUST read demo credentials from environment variables with safe local defaults. Public admin creation is out of scope.
11. CORS origins MUST be environment-driven. Development MAY default to documented localhost origins. Production MUST require an explicit non-empty allowlist and fail startup when it is missing. Wildcard production CORS is forbidden.
12. JWT uses an access-token-only design. `JWT_EXPIRES_IN` defaults to `3600` and MUST be configurable through validated environment variables. Refresh tokens are out of scope.
13. `Idempotency-Key` is optional and applies only to attempt submission. Its scope is the authenticated user. A replay with the same normalized request payload MUST return the stored successful response with HTTP `200`; reuse with a different normalized request payload MUST return `409 IDEMPOTENCY_KEY_REUSED`. Idempotency handling and submission MUST participate in the same transaction.
14. `prisma migrate reset --force` MUST NOT run during Phase 0. In later phases, destructive reset helpers may run only when `NODE_ENV=development`, the database host is `localhost`, `127.0.0.1`, or the approved local Docker service `postgres`, and the database name is clearly development-specific. CI MUST use migration deployment against its disposable PostgreSQL service container.
15. Node.js 24 LTS MUST be pinned consistently in `.nvmrc`, `package.json` engines, Dockerfile, and GitHub Actions. Do not mix Node major versions across environments.

# 2. Scope

## 2.1 Mandatory Product Scope

The implementation MUST provide:

1. Public user registration and login.
2. Two roles: `ADMIN` and `USER`.
3. JWT authentication and role-based authorization.
4. Admin-only quiz creation, update, deletion where safe, publication, archival, and question management.
5. User listing of available published quizzes.
6. Starting or resuming a quiz attempt.
7. Quiz questions returned without correct answers.
8. Submission of answers with server-side validation and scoring.
9. Score and correct/incorrect answer breakdown returned in the same submit response.
10. Persistent per-user quiz history.
11. Duplicate-submission protection.
12. One open attempt per user per quiz.
13. Quiz retakes, with every attempt tracked as a separate row (BR-51).
14. Swagger/OpenAPI documentation.
15. Basic unit and end-to-end test coverage.
16. Docker-based local setup.
17. A clear README with setup, architecture, trade-offs, assumptions, limitations, future improvements, and a development-process disclosure.
18. A clean, staged Git commit history.

## 2.2 Quality Scope

The implementation MUST demonstrate:

- Clear module boundaries.
- Consistent naming and error contracts.
- Correct authorization and ownership checks.
- Explicit database constraints for integrity.
- Race-safe submission behavior.
- Defense in depth against correct-answer disclosure.
- Deterministic API contracts.
- Production-aware logging, health checks, configuration validation, and CI.
- Documented trade-offs rather than unnecessary complexity.

## 2.3 Non-Goals — Do Not Build

The following are explicit non-goals and MUST NOT be introduced unless the PRD is formally changed:

- Kafka
- RabbitMQ
- Redis without a demonstrated need
- Kubernetes
- GraphQL
- Full CQRS
- Event Sourcing
- Multiple repositories
- Real microservices
- Complex OAuth
- Frontend
- Full `QuizVersion` / `QuizVersionQuestion` entities (explicitly out of scope for this submission; MAY be described as a future extension)

Additional non-goals:

- Password reset and email verification.
- Social login.
- Payment processing.
- Real-time multiplayer quizzes.
- WebSockets.
- Background scheduler or cron-based attempt expiry.
- Advanced analytics dashboards.
- Question banks shared across quizzes.
- File or media uploads.

# 3. Architecture and Technology Decisions

## 3.1 Required Architecture

The application MUST be implemented as a **modular monolith**. The runtime is one deployable API and one PostgreSQL database. Internal modules MUST be separated so they can be extracted later without requiring microservice operational overhead during this assignment.

Required modules:

```text
src/
  modules/
    auth/
    users/
    quizzes/
    attempts/
  common/
    auth/
    decorators/
    dto/
    errors/
    filters/
    guards/
    interceptors/
    logging/
    pagination/
  infrastructure/
    config/
    database/
    health/
```

Layering rule:

```text
Controller -> Application Service -> Repository/Prisma -> PostgreSQL
```

Controllers MUST contain HTTP concerns only. Business rules MUST live in services/domain helpers. Raw Prisma access MUST NOT be spread across controllers.

## 3.2 Required Stack

| Area | Required choice |
|---|---|
| Runtime | Current Node.js LTS, pinned via `.nvmrc` and `package.json` engines |
| Language | TypeScript with `strict: true` |
| Framework | NestJS |
| Database | PostgreSQL |
| ORM | Prisma |
| Authentication | JWT access token |
| Password hashing | Argon2id preferred; bcrypt acceptable only if documented |
| Validation | NestJS ValidationPipe + class-validator or equivalent |
| API documentation | Swagger/OpenAPI |
| Logging | Pino-compatible structured JSON logging |
| Testing | Jest + Supertest |
| Containers | Dockerfile + Docker Compose |
| CI | GitHub Actions |

## 3.3 Quiz Content Strategy — LOCKED

The versioning decision is final. There is no decision gate. Claude Code MUST NOT reconsider or replace this strategy unless the operator explicitly requests it.

### Lifecycle

```text
DRAFT      -> editable quiz and questions
PUBLISHED  -> quiz and questions are immutable; users may start attempts
ARCHIVED   -> new attempts are rejected; existing open attempts remain valid
```

Rules:

1. A `DRAFT` quiz MAY be edited freely.
2. A quiz MUST contain at least one valid question before it can be published.
3. A `PUBLISHED` quiz and its questions MUST be immutable. Any create, update, or delete of a published quiz's content MUST be rejected with `409 PUBLISHED_QUIZ_IMMUTABLE`.
4. An `ARCHIVED` quiz MUST reject new attempts with `409 QUIZ_ARCHIVED`.
5. Archiving MUST NOT invalidate existing `IN_PROGRESS` attempts; they remain valid until submitted or lazily expired.

### Per-attempt snapshot

At attempt start, the server MUST store an immutable snapshot of the quiz title and its questions inside the attempt row (`quizTitleSnapshot`, `questionsSnapshot`).

- The snapshot MUST include `correctOptionIndex` for server-side scoring.
- The snapshot MUST NEVER be serialized into any user-facing response containing `correctOptionIndex`.
- All submission validation and scoring MUST run against the attempt snapshot, never against current quiz rows.

Rationale (to be recorded in ADR-002 and README): published immutability already prevents content drift; the snapshot additionally guarantees reproducible scoring, keeps history independent of the quiz lifecycle, and protects results against future deletions or migrations — at a fraction of the cost of full `QuizVersion` entities.

## 3.4 Attempt Concurrency Strategy

The implementation MUST NOT rely on a read-then-write sequence for duplicate submission protection.

Inside a database transaction, submit MUST use an atomic conditional update equivalent to:

```sql
UPDATE "QuizAttempt"
SET "status" = 'SUBMITTED',
    "submittedAt" = NOW(),
    "scoreCorrect" = :scoreCorrect,
    "scoreTotal" = :scoreTotal,
    "scorePercentage" = :scorePercentage
WHERE "id" = :attemptId
  AND "userId" = :userId
  AND "status" = 'IN_PROGRESS'
  AND ("expiresAt" IS NULL OR "expiresAt" > NOW());
```

The `expiresAt` predicate is mandatory: without it, an expired attempt whose lazy-expiry transition has not yet run could be submitted successfully, violating BR-35.

The application MUST inspect the affected-row count. If zero rows are updated, it MUST distinguish not found, not owned, expired, or already submitted and return the corresponding error. `SELECT ... FOR UPDATE` is not required.

Recommended transaction order (Prisma `updateMany` inside a transaction provides the affected-row count):

```text
BEGIN
  1. Load the attempt snapshot (immutable; safe to read before claiming).
  2. Validate the submitted answers against the snapshot (BR-26..BR-29).
     Validation failures return 400 and the transaction is rolled back.
  3. Compute the score from the snapshot.
  4. Execute the atomic conditional UPDATE above.
     If affectedRows = 0: ROLLBACK, resolve the exact reason, return 404/403/409.
  5. INSERT AttemptAnswer rows.
COMMIT
```

Concurrent start requests MUST converge on a single open attempt:

1. Look up an open attempt; if found, return it with `200`.
2. Otherwise attempt creation.
3. If creation fails on the partial unique index, re-read the winning open attempt and return it with `200`.

## 3.5 Lazy Expiry — No Scheduler

No scheduler, cron job, queue worker, background expiry process, or `@Cron` decorator MAY be implemented.

Expiry MUST be evaluated lazily:

- when an attempt is started or resumed;
- when an attempt is read;
- when an attempt is submitted;
- when history is read, if status normalization is needed.

If an attempt is `IN_PROGRESS` and `expiresAt <= now`, the current request MUST atomically transition it to `EXPIRED` before continuing.

# 4. Domain Model

## 4.1 Entities

| Entity | Responsibility |
|---|---|
| User | Identity, password hash, and role |
| Quiz | Quiz definition and lifecycle; immutable once published |
| Question | Question rows; immutable once the quiz is published |
| QuizAttempt | One user interaction with a quiz, carrying its own immutable content snapshot |
| AttemptAnswer | Persisted selected answer and correctness |
| IdempotencyRecord | Optional submit retry/replay protection |

## 4.2 Complete Prisma Schema

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum UserRole {
  ADMIN
  USER
}

enum QuizStatus {
  DRAFT
  PUBLISHED
  ARCHIVED
}

enum AttemptStatus {
  IN_PROGRESS
  SUBMITTED
  EXPIRED
}

model User {
  id                 String              @id @default(uuid()) @db.Uuid
  email              String              @unique
  passwordHash       String
  role               UserRole            @default(USER)
  createdAt          DateTime            @default(now())
  updatedAt          DateTime            @updatedAt

  quizzesCreated     Quiz[]              @relation("QuizCreatedBy")
  attempts           QuizAttempt[]
  idempotencyRecords IdempotencyRecord[]
}

model Quiz {
  id               String        @id @default(uuid()) @db.Uuid
  title            String
  description      String?
  status           QuizStatus    @default(DRAFT)
  timeLimitSeconds Int?
  createdById      String        @db.Uuid
  publishedAt      DateTime?
  archivedAt       DateTime?
  createdAt        DateTime      @default(now())
  updatedAt        DateTime      @updatedAt

  createdBy        User          @relation("QuizCreatedBy", fields: [createdById], references: [id], onDelete: Restrict)
  questions        Question[]
  attempts         QuizAttempt[]

  @@index([status, createdAt])
  @@index([createdById])
}

model Question {
  id                 String          @id @default(uuid()) @db.Uuid
  quizId             String          @db.Uuid
  position           Int
  questionText       String
  options            Json
  correctOptionIndex Int
  createdAt          DateTime        @default(now())
  updatedAt          DateTime        @updatedAt

  quiz               Quiz            @relation(fields: [quizId], references: [id], onDelete: Cascade)
  attemptAnswers     AttemptAnswer[]

  @@unique([quizId, position])
  @@index([quizId])
}

model QuizAttempt {
  id                 String              @id @default(uuid()) @db.Uuid
  userId             String              @db.Uuid
  quizId             String              @db.Uuid
  status             AttemptStatus       @default(IN_PROGRESS)
  quizTitleSnapshot  String
  questionsSnapshot  Json
  startedAt          DateTime            @default(now())
  expiresAt          DateTime?
  submittedAt        DateTime?
  scoreCorrect       Int?
  scoreTotal         Int?
  scorePercentage    Decimal?            @db.Decimal(5, 2)
  createdAt          DateTime            @default(now())
  updatedAt          DateTime            @updatedAt

  user               User                @relation(fields: [userId], references: [id], onDelete: Restrict)
  quiz               Quiz                @relation(fields: [quizId], references: [id], onDelete: Restrict)
  answers            AttemptAnswer[]
  idempotencyRecords IdempotencyRecord[]

  @@index([userId, quizId, status])
  @@index([userId, createdAt])
}

model AttemptAnswer {
  id                  String      @id @default(uuid()) @db.Uuid
  attemptId           String      @db.Uuid
  questionId          String      @db.Uuid
  selectedOptionIndex Int?
  isCorrect           Boolean     @default(false)
  createdAt           DateTime    @default(now())

  attempt             QuizAttempt @relation(fields: [attemptId], references: [id], onDelete: Cascade)
  question            Question    @relation(fields: [questionId], references: [id], onDelete: Restrict)

  @@unique([attemptId, questionId])
  @@index([attemptId])
}

model IdempotencyRecord {
  id             String       @id @default(uuid()) @db.Uuid
  userId         String       @db.Uuid
  key            String
  operation      String
  attemptId      String?      @db.Uuid
  requestHash    String
  responseStatus Int?
  responseBody   Json?
  createdAt      DateTime     @default(now())
  expiresAt      DateTime

  user           User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  attempt        QuizAttempt? @relation(fields: [attemptId], references: [id], onDelete: Cascade)

  @@unique([userId, key])
  @@index([expiresAt])
}
```

Notes:

- `AttemptAnswer.questionId` keeps a foreign key to `Question` with `onDelete: Restrict`. This is safe because published questions are immutable and quizzes with attempt history cannot be hard-deleted (BR-17). The attempt snapshot remains the scoring authority (BR-26).
- Hard deletion of quizzes is restricted to safe drafts, so no soft-delete column is required.

## 4.3 Required Partial Unique Index

Prisma schema syntax does not currently express the required PostgreSQL partial unique index. A raw SQL migration MUST add it (kept under `prisma/migrations/<timestamp>_open_attempt_constraint/migration.sql`):

```sql
CREATE UNIQUE INDEX "QuizAttempt_one_open_per_user_quiz"
ON "QuizAttempt" ("userId", "quizId")
WHERE "status" = 'IN_PROGRESS';
```

This index is mandatory. Application-level checks alone are insufficient.

## 4.4 Integrity Constraints Summary

The database MUST enforce all of the following:

1. One open attempt per user per quiz through the partial unique index.
2. One answer per question per attempt through `@@unique([attemptId, questionId])`.
3. One idempotency key per user through `@@unique([userId, key])`.
4. One question position per quiz through `@@unique([quizId, position])`.
5. Unique user email.

## 4.5 Attempt Snapshot Structure

`questionsSnapshot` MUST contain a server-only structure equivalent to:

```json
{
  "quiz": {
    "id": "uuid",
    "title": "Node.js Basics",
    "timeLimitSeconds": 900
  },
  "questions": [
    {
      "questionId": "uuid",
      "position": 1,
      "questionText": "Which HTTP status means Not Found?",
      "options": ["200", "201", "404", "500"],
      "correctOptionIndex": 2
    }
  ]
}
```

The user-facing DTO derived from this snapshot MUST remove every `correctOptionIndex`.

# 5. API Contract Conventions

## 5.1 Base URL and Versioning

All application endpoints MUST use:

```text
/api/v1
```

Swagger UI SHOULD be exposed at `/api/docs`; OpenAPI JSON SHOULD be exposed at `/api/docs-json`.

## 5.2 IDs, Dates, and Content Type

- IDs MUST be UUID strings.
- Dates MUST be UTC ISO 8601 strings.
- Request and response content type MUST be `application/json` except `204` responses.
- Unknown request fields MUST be rejected or stripped through a global whitelist policy; forbidden fields SHOULD trigger validation errors.

## 5.3 Authentication Header

```http
Authorization: Bearer <access-token>
```

## 5.4 Score Contract

Scores MUST use this exact JSON structure:

```json
{
  "score": {
    "correct": 7,
    "total": 10,
    "percentage": 70.0
  }
}
```

Rules:

- `correct` and `total` are integers.
- `percentage` is a number rounded to two decimal places using `Math.round(value * 100) / 100`.
- No string such as `"7/10"` is used as the authoritative value.
- A human-readable `display` field MAY be added but MUST NOT replace the numeric fields.

## 5.5 Pagination Contract

Every paginated endpoint MUST return:

```json
{
  "data": [],
  "pagination": {
    "page": 1,
    "limit": 20,
    "totalItems": 42,
    "totalPages": 3,
    "hasNextPage": true,
    "hasPreviousPage": false
  }
}
```

Rules:

- Default `page` is `1`. Default `limit` is `20`. Maximum `limit` is `100`.
- Invalid page or limit MUST return `400 INVALID_PAGINATION`.

## 5.6 Error Envelope

All application errors MUST use:

```json
{
  "statusCode": 409,
  "error": {
    "code": "ATTEMPT_ALREADY_SUBMITTED",
    "message": "This quiz attempt has already been submitted.",
    "details": [],
    "requestId": "req_01J...",
    "timestamp": "2026-06-23T10:00:00.000Z",
    "path": "/api/v1/attempts/uuid/submit"
  }
}
```

Validation errors MUST put field-level information in `details`:

```json
{
  "field": "answers[0].selectedOptionIndex",
  "issue": "must be within the option range"
}
```

## 5.7 List and Single-Resource Responses

- Single-resource endpoints MUST return the resource directly.
- Paginated endpoints MUST use the pagination contract.
- Create endpoints MUST return `201` and the created resource.
- Successful deletion MUST return `204` with no response body.

# 6. Endpoint Catalog

## 6.1 Summary

| ID | Method | Path | Access | Success |
|---|---|---|---|---|
| AUTH-01 | POST | `/api/v1/auth/register` | Public | 201 |
| AUTH-02 | POST | `/api/v1/auth/login` | Public | 200 |
| AUTH-03 | GET | `/api/v1/auth/me` | Authenticated | 200 |
| QUIZ-01 | POST | `/api/v1/admin/quizzes` | ADMIN | 201 |
| QUIZ-02 | GET | `/api/v1/admin/quizzes` | ADMIN | 200 |
| QUIZ-03 | GET | `/api/v1/admin/quizzes/:quizId` | ADMIN | 200 |
| QUIZ-04 | PATCH | `/api/v1/admin/quizzes/:quizId` | ADMIN | 200 |
| QUIZ-05 | DELETE | `/api/v1/admin/quizzes/:quizId` | ADMIN | 204 |
| QUES-01 | POST | `/api/v1/admin/quizzes/:quizId/questions` | ADMIN | 201 |
| QUES-02 | PATCH | `/api/v1/admin/quizzes/:quizId/questions/:questionId` | ADMIN | 200 |
| QUES-03 | DELETE | `/api/v1/admin/quizzes/:quizId/questions/:questionId` | ADMIN | 204 |
| LIFE-01 | POST | `/api/v1/admin/quizzes/:quizId/publish` | ADMIN | 200 |
| LIFE-02 | POST | `/api/v1/admin/quizzes/:quizId/archive` | ADMIN | 200 |
| USER-01 | GET | `/api/v1/quizzes` | USER | 200 |
| USER-02 | GET | `/api/v1/quizzes/:quizId` | USER | 200 |
| ATT-01 | POST | `/api/v1/quizzes/:quizId/attempts` | USER | 201 or 200 |
| ATT-02 | GET | `/api/v1/attempts/:attemptId` | Owner USER | 200 |
| ATT-03 | POST | `/api/v1/attempts/:attemptId/submit` | Owner USER | 200 |
| HIST-01 | GET | `/api/v1/users/me/quiz-history` | USER | 200 |
| HIST-02 | GET | `/api/v1/users/me/quiz-history/:attemptId` | Owner USER | 200 |
| OPS-01 | GET | `/health/live` | Public | 200 |
| OPS-02 | GET | `/health/ready` | Public | 200 or 503 |

## 6.2 AUTH-01 — Register

**Request**

```json
{
  "email": "user@example.com",
  "password": "StrongPass123!"
}
```

**Response — 201**

```json
{
  "id": "uuid",
  "email": "user@example.com",
  "role": "USER",
  "createdAt": "2026-06-23T10:00:00.000Z"
}
```

**Errors**: `400 VALIDATION_FAILED`, `400 VALIDATION_ERROR` for forbidden or unknown properties such as `role`, `409 EMAIL_ALREADY_EXISTS`.

The request MUST NOT accept or honor an `ADMIN` role.

## 6.3 AUTH-02 — Login

**Request**

```json
{
  "email": "user@example.com",
  "password": "StrongPass123!"
}
```

**Response — 200**

```json
{
  "accessToken": "jwt",
  "tokenType": "Bearer",
  "expiresInSeconds": 3600,
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "role": "USER"
  }
}
```

**Errors**: `401 INVALID_CREDENTIALS`.

## 6.4 AUTH-03 — Current User

**Response — 200**

```json
{
  "id": "uuid",
  "email": "user@example.com",
  "role": "USER",
  "createdAt": "2026-06-23T10:00:00.000Z"
}
```

## 6.5 QUIZ-01 — Create Draft Quiz

**Request**

```json
{
  "title": "Node.js Fundamentals",
  "description": "Core Node.js and backend concepts",
  "timeLimitSeconds": 900
}
```

**Response — 201**

```json
{
  "id": "uuid",
  "title": "Node.js Fundamentals",
  "description": "Core Node.js and backend concepts",
  "status": "DRAFT",
  "timeLimitSeconds": 900,
  "questionCount": 0,
  "publishedAt": null,
  "createdAt": "2026-06-23T10:00:00.000Z",
  "updatedAt": "2026-06-23T10:00:00.000Z"
}
```

**Errors**: `400 VALIDATION_FAILED`, `401 UNAUTHENTICATED`, `403 FORBIDDEN`.

## 6.6 QUIZ-02 — Admin List Quizzes

**Query parameters**

```text
page=1&limit=20&status=DRAFT&search=node
```

**Response — 200** uses the standard pagination contract. Admin results MAY include draft metadata but SHOULD NOT return every question in the list response.

## 6.7 QUIZ-03 — Admin Quiz Detail

**Response — 200**

```json
{
  "id": "uuid",
  "title": "Node.js Fundamentals",
  "description": "Core Node.js and backend concepts",
  "status": "DRAFT",
  "timeLimitSeconds": 900,
  "publishedAt": null,
  "questions": [
    {
      "id": "uuid",
      "position": 1,
      "questionText": "Which status code means Not Found?",
      "options": ["200", "201", "404", "500"],
      "correctOptionIndex": 2
    }
  ]
}
```

Correct answers are allowed in admin-only responses.

## 6.8 QUIZ-04 — Update Quiz

**Request**

```json
{
  "title": "Advanced Node.js Fundamentals",
  "timeLimitSeconds": 1200
}
```

**Response — 200** returns the updated quiz.

A `PUBLISHED` quiz MUST reject updates with `409 PUBLISHED_QUIZ_IMMUTABLE`. An `ARCHIVED` quiz MUST also reject updates.

## 6.9 QUIZ-05 — Delete Quiz

**Success — 204** only when the quiz is safely deletable.

A quiz that has ever been published or that has any attempt history MUST NOT be hard-deleted. It MUST return `409 QUIZ_DELETE_NOT_ALLOWED`; the caller should archive it.

## 6.10 QUES-01 — Add Question

**Request**

```json
{
  "position": 1,
  "questionText": "Which status code means Not Found?",
  "options": ["200", "201", "404", "500"],
  "correctOptionIndex": 2
}
```

**Response — 201** returns the created question.

Adding a question to a `PUBLISHED` or `ARCHIVED` quiz MUST be rejected with `409 PUBLISHED_QUIZ_IMMUTABLE`.

Validation MUST enforce:

- question text length between 3 and 500 characters;
- 2 to 10 options;
- options are non-empty strings;
- options are unique after trimming and case normalization;
- correct index is within the options array;
- position is a positive integer and unique within the quiz.

## 6.11 QUES-02 — Update Question

**Request** MAY contain any editable question fields. The same validation rules apply after merging existing and new fields.

**Response — 200** returns the updated question.

Updating a question of a `PUBLISHED` or `ARCHIVED` quiz MUST be rejected with `409 PUBLISHED_QUIZ_IMMUTABLE`.

## 6.12 QUES-03 — Delete Question

**Success — 204**.

Deleting a question of a `PUBLISHED` or `ARCHIVED` quiz MUST be rejected with `409 PUBLISHED_QUIZ_IMMUTABLE`. Deleting a draft question MUST NOT affect existing attempts, which score against their own snapshots.

## 6.13 LIFE-01 — Publish Quiz

**Request**: empty JSON object or no body.

**Response — 200**

```json
{
  "id": "uuid",
  "status": "PUBLISHED",
  "publishedAt": "2026-06-23T10:00:00.000Z"
}
```

Publishing MUST fail if:

- the quiz has zero questions (`409 QUIZ_HAS_NO_QUESTIONS`);
- any question is invalid;
- time limit is present but invalid;
- the quiz is archived.

Publishing MUST be transactional and makes the quiz and its questions immutable.

## 6.14 LIFE-02 — Archive Quiz

**Response — 200**

```json
{
  "id": "uuid",
  "status": "ARCHIVED",
  "archivedAt": "2026-06-23T10:00:00.000Z"
}
```

Archival MUST block new attempts but MUST NOT invalidate attempts already started. Open attempts remain valid until their own expiry or submission.

## 6.15 USER-01 — List Available Quizzes

Only currently published, non-archived quizzes are returned.

**Response — 200**

```json
{
  "data": [
    {
      "id": "uuid",
      "title": "Node.js Fundamentals",
      "description": "Core Node.js and backend concepts",
      "questionCount": 10,
      "timeLimitSeconds": 900
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "totalItems": 1,
    "totalPages": 1,
    "hasNextPage": false,
    "hasPreviousPage": false
  }
}
```

No correct answer field MAY appear.

## 6.16 USER-02 — Quiz Preview

Returns quiz metadata only. It MUST NOT reveal questions or correct answers before an attempt is started. Questions are returned only with an active attempt.

## 6.17 ATT-01 — Start or Resume Attempt

**Request**: no body.

Behavior:

- If no open attempt exists, create one (storing the content snapshot) and return `201` with `resumed: false`.
- If an unexpired `IN_PROGRESS` attempt already exists for the user and quiz, return that same attempt with `200` and `resumed: true`. The server MUST NOT create a second open attempt.
- If the existing open attempt is expired, mark it `EXPIRED` lazily and create a new attempt (retakes are always allowed, BR-51).
- If a previous attempt is `SUBMITTED` or `EXPIRED` and no open attempt exists, create a new attempt and return `201` (retake).
- Starting an unpublished quiz MUST return `409 QUIZ_NOT_PUBLISHED`; starting an archived quiz MUST return `409 QUIZ_ARCHIVED`.

**Response — 201 or 200**

```json
{
  "id": "uuid",
  "quiz": {
    "id": "uuid",
    "title": "Node.js Fundamentals",
    "description": "Core Node.js and backend concepts"
  },
  "status": "IN_PROGRESS",
  "startedAt": "2026-06-23T10:00:00.000Z",
  "expiresAt": "2026-06-23T10:15:00.000Z",
  "resumed": false,
  "questions": [
    {
      "id": "uuid",
      "position": 1,
      "questionText": "Which status code means Not Found?",
      "options": ["200", "201", "404", "500"]
    }
  ]
}
```

The entire response tree MUST contain no property named `correctOptionIndex`.

## 6.18 ATT-02 — Get Attempt

Only the owner may access the attempt.

For an in-progress attempt, return the same safe question structure as ATT-01. For a submitted attempt, return the result directly using the ATT-03 result contract. Lazy expiry MUST be evaluated here.

## 6.19 ATT-03 — Submit Attempt

**Optional header**

```http
Idempotency-Key: 8f98be2f-d849-4cdb-b8c4-33f24ed2cb34
```

**Request**

```json
{
  "answers": [
    { "questionId": "uuid", "selectedOptionIndex": 2 },
    { "questionId": "uuid", "selectedOptionIndex": 0 }
  ]
}
```

**Response — 200**

```json
{
  "attemptId": "uuid",
  "quiz": {
    "id": "uuid",
    "title": "Node.js Fundamentals"
  },
  "status": "SUBMITTED",
  "submittedAt": "2026-06-23T10:10:00.000Z",
  "score": {
    "correct": 1,
    "total": 2,
    "percentage": 50.0
  },
  "totalQuestions": 2,
  "percentage": 50.0,
  "answers": [
    {
      "questionId": "uuid",
      "selectedOptionIndex": 2,
      "answered": true,
      "isCorrect": true
    },
    {
      "questionId": "uuid",
      "selectedOptionIndex": null,
      "answered": false,
      "isCorrect": false
    }
  ]
}
```

Correct indices MUST NOT be returned in successful submission responses.

Submission MUST be transactional and race-safe per Section 3.4. A second submit without a matching completed idempotency record MUST return `409 ATTEMPT_ALREADY_SUBMITTED`.

If the same `Idempotency-Key` is replayed with the same normalized request payload, the server MUST return the stored successful response. If it is replayed with a different normalized payload, return `409 IDEMPOTENCY_KEY_REUSED`.

## 6.20 HIST-01 — Quiz History

**Query parameters** MAY include `page`, `limit`, `quizId`, and `status`.

**Response — 200**

```json
{
  "data": [
    {
      "attemptId": "uuid",
      "quizId": "uuid",
      "quizTitle": "Node.js Fundamentals",
      "status": "SUBMITTED",
      "score": {
        "correct": 7,
        "total": 10,
        "percentage": 70.0
      },
      "startedAt": "2026-06-23T10:00:00.000Z",
      "submittedAt": "2026-06-23T10:10:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "totalItems": 1,
    "totalPages": 1,
    "hasNextPage": false,
    "hasPreviousPage": false
  }
}
```

`quizTitle` MUST come from the attempt snapshot so history stays stable regardless of later quiz changes. Multiple attempts of the same quiz (retakes) MUST each appear as separate rows.

## 6.21 HIST-02 — Result Detail

Only the attempt owner may access the result. Submitted attempts return the full scoring breakdown. Expired attempts return status and timestamps but no fabricated score.

## 6.22 Health Endpoints

`GET /health/live` confirms the process is running and MUST NOT require the database.

`GET /health/ready` MUST check database connectivity and return `503` if the API cannot safely serve requests.

# 7. Business Rules

## Identity and Access

- **BR-01:** Public registration MUST always create role `USER`.
- **BR-02:** Client-supplied role fields MUST NOT grant `ADMIN` privileges.
- **BR-03:** Passwords MUST be stored only as a strong one-way hash.
- **BR-04:** Login failure MUST NOT reveal whether an email exists.
- **BR-05:** Admin-only endpoints MUST enforce role authorization server-side.
- **BR-06:** Attempt and result endpoints MUST enforce resource ownership server-side.

## Quiz and Question Lifecycle

- **BR-07:** New quizzes MUST start in `DRAFT` status.
- **BR-08:** A quiz MUST contain at least one valid question before publication.
- **BR-09:** Every question MUST contain 2–10 unique non-empty options.
- **BR-10:** `correctOptionIndex` MUST be an integer within the options array.
- **BR-11:** Publication MUST be transactional and MUST set `publishedAt`.
- **BR-12:** A `PUBLISHED` quiz and its questions MUST be immutable. Content modification MUST be rejected with `409 PUBLISHED_QUIZ_IMMUTABLE`.
- **BR-13:** Attempt snapshots MUST never be mutated after creation.
- **BR-14:** At attempt start, the server MUST store an immutable snapshot of the quiz title and questions (including correct indices) on the attempt row.
- **BR-15:** `ARCHIVED` quizzes MUST reject new attempts with `409 QUIZ_ARCHIVED`.
- **BR-16:** Archiving MUST NOT invalidate an already-open attempt; it remains valid until submit or expiry.
- **BR-17:** Hard deletion MUST be allowed only for a draft that has never been published and has no attempt history.

## Attempt Start, Resume, and Retake

- **BR-18:** The database MUST enforce at most one `IN_PROGRESS` attempt per user per quiz.
- **BR-19:** Starting a quiz with an existing unexpired open attempt MUST return the same attempt with HTTP `200` and `resumed: true`.
- **BR-20:** Starting a quiz without an open attempt MUST create one and return HTTP `201` and `resumed: false`.
- **BR-21:** An attempt MUST serve its questions and score its answers exclusively from its own immutable snapshot.
- **BR-22:** The start/resume response MUST NOT contain `correctOptionIndex` anywhere in the response tree.
- **BR-23:** If a quiz has a time limit, `expiresAt` MUST be calculated from server time at attempt creation.
- **BR-24:** Expiry MUST be evaluated lazily; no scheduler or cron MAY be implemented.
- **BR-51:** Retakes are always allowed. After an attempt reaches `SUBMITTED` or `EXPIRED`, the user MAY start a new attempt for the same quiz. Every retake MUST create a new attempt row using the quiz content snapshot taken at the time the new attempt starts. Concurrent start requests MUST converge on a single open attempt: if creation loses the partial-unique-index race, the application MUST load and return the winning open attempt.

## Submission and Scoring

- **BR-25:** Only the attempt owner MAY submit answers.
- **BR-26:** Every submitted question ID MUST belong to the attempt snapshot.
- **BR-27:** A question MUST appear at most once in the submitted answers array.
- **BR-28:** Every selected option index MUST be valid for its question.
- **BR-29:** Omitted questions MUST be treated as incorrect; partial submissions are allowed.
- **BR-30:** The server MUST calculate the score; client-supplied scores MUST be ignored or rejected.
- **BR-31:** The score and answer breakdown MUST be returned in the same successful submit response.
- **BR-32:** Percentage MUST be rounded to two decimal places according to Section 5.4.
- **BR-33:** Submit MUST use an atomic conditional update on `status = IN_PROGRESS` including the `expiresAt` predicate, inside the transaction (Section 3.4).
- **BR-34:** A concurrent or later duplicate submission MUST return `409 ATTEMPT_ALREADY_SUBMITTED` unless an identical idempotent replay is being served.
- **BR-35:** If `expiresAt <= now`, submission MUST fail with `409 ATTEMPT_EXPIRED` and status SHOULD be normalized to `EXPIRED`.
- **BR-36:** `AttemptAnswer` persistence and attempt score/status update MUST commit atomically.
- **BR-37:** A repeated idempotency key with the same normalized payload MUST return the stored successful response.
- **BR-38:** A repeated idempotency key with a different normalized payload MUST return `409 IDEMPOTENCY_KEY_REUSED`.

## Result History

- **BR-39:** Submitted results MUST remain reproducible regardless of later quiz edits, archival, or republication; history reads MUST rely on attempt snapshots.
- **BR-40:** History MUST be scoped to the authenticated user unless accessed through a future explicit admin endpoint.
- **BR-41:** Expired attempts MUST NOT receive fabricated scores.

## Correct-Answer Defense in Depth

- **BR-42:** User-facing repository queries and snapshot projections MUST explicitly omit `correctOptionIndex`; they MUST NOT fetch full content and delete the field afterward.
- **BR-43:** User-facing response DTOs MUST explicitly define safe fields and use serialization/interceptor protection.
- **BR-44:** An E2E test MUST recursively scan the entire start/resume response and fail if any key named `correctOptionIndex` exists.
- **BR-45:** Logs, traces, and error details MUST NOT expose passwords, JWTs, correct answers, or raw attempt snapshots.

## API and Operations

- **BR-46:** Every error MUST follow the common error envelope.
- **BR-47:** Every request MUST have a request ID, accepted from `x-request-id` or generated by the server.
- **BR-48:** Readiness MUST verify PostgreSQL connectivity.
- **BR-49:** Configuration MUST be validated at startup; invalid mandatory configuration MUST fail fast.
- **BR-50:** Every mandatory endpoint MUST be represented in Swagger with authentication and error responses.

## Environment Safety

- **BR-52:** `prisma migrate reset --force` and any other destructive reset helper MUST only run against a verified local development database. The helper MUST refuse to run if `NODE_ENV` is not `development` or `DATABASE_URL` does not point to localhost / `127.0.0.1` / the local Docker service. It MUST NOT run against staging, CI production data, or production.

# 8. Error Codes

| HTTP | Code | Meaning |
|---|---|---|
| 400 | VALIDATION_FAILED | Request body or parameter validation failed |
| 400 | VALIDATION_ERROR | Unknown or forbidden request property was submitted |
| 400 | INVALID_PAGINATION | Invalid page or limit |
| 400 | INVALID_QUESTION_OPTIONS | Options are missing, duplicated, empty, or outside allowed count |
| 400 | INVALID_CORRECT_OPTION_INDEX | Correct index is outside options range |
| 400 | INVALID_SELECTED_OPTION_INDEX | Submitted index is outside options range |
| 400 | DUPLICATE_QUESTION_ANSWER | Same question appears more than once in one submission |
| 400 | QUESTION_NOT_IN_ATTEMPT | Submitted question does not belong to the attempt snapshot |
| 401 | UNAUTHENTICATED | Token missing, invalid, or expired |
| 401 | INVALID_CREDENTIALS | Login failed |
| 403 | FORBIDDEN | Role is insufficient |
| 403 | ATTEMPT_NOT_OWNED | Attempt belongs to another user |
| 404 | USER_NOT_FOUND | User does not exist |
| 404 | QUIZ_NOT_FOUND | Quiz does not exist |
| 404 | QUESTION_NOT_FOUND | Question does not exist |
| 404 | ATTEMPT_NOT_FOUND | Attempt does not exist |
| 409 | EMAIL_ALREADY_EXISTS | Email is already registered |
| 409 | QUIZ_HAS_NO_QUESTIONS | Quiz cannot be published without questions |
| 409 | QUIZ_NOT_PUBLISHED | Quiz cannot be started |
| 409 | QUIZ_ARCHIVED | New attempts are blocked |
| 409 | QUIZ_DELETE_NOT_ALLOWED | Quiz has been published or has attempt history |
| 409 | PUBLISHED_QUIZ_IMMUTABLE | Published quiz content cannot be modified |
| 409 | ATTEMPT_ALREADY_SUBMITTED | Attempt is no longer open |
| 409 | ATTEMPT_EXPIRED | Attempt deadline has passed |
| 409 | OPEN_ATTEMPT_CONFLICT | Database found a conflicting open attempt that cannot be resumed safely |
| 409 | IDEMPOTENCY_KEY_REUSED | Key replayed with changed body |
| 429 | RATE_LIMITED | Login or registration rate limit exceeded |
| 500 | INTERNAL_ERROR | Unexpected server failure |
| 503 | SERVICE_NOT_READY | Database or required dependency unavailable |

# 9. Edge-Case Matrix

| ID | Scenario | Required behavior | HTTP/Error | Required test |
|---|---|---|---|---|
| EC-01 | Question ID is not part of attempt snapshot | Reject entire submission | 400 QUESTION_NOT_IN_ATTEMPT | E2E |
| EC-02 | Selected option is out of range | Reject entire submission | 400 INVALID_SELECTED_OPTION_INDEX | E2E |
| EC-03 | Same question sent twice | Reject entire submission | 400 DUPLICATE_QUESTION_ANSWER | Unit + E2E |
| EC-04 | Same attempt submitted twice | First succeeds; later request rejected or idempotently replayed | 409 or 200 replay | E2E |
| EC-05 | Submit without starting | No attempt resource exists | 404 ATTEMPT_NOT_FOUND | E2E |
| EC-06 | User accesses another user's attempt | Deny without leaking result | 403 ATTEMPT_NOT_OWNED | E2E |
| EC-07 | Publish quiz with zero questions | Reject publication | 409 QUIZ_HAS_NO_QUESTIONS | E2E |
| EC-08 | Delete quiz with published history/results | Reject hard deletion; archive instead | 409 QUIZ_DELETE_NOT_ALLOWED | E2E |
| EC-09 | USER calls admin endpoint | Deny | 403 FORBIDDEN | E2E |
| EC-10 | Duplicate registration email | Reject | 409 EMAIL_ALREADY_EXISTS | E2E |
| EC-11 | User calls start ten times | Return same open attempt; no duplicates | 200 resumed | Concurrent E2E |
| EC-12 | Two submit requests race | Exactly one state transition and answer set commits | one 200, one 409/replay | Concurrent integration |
| EC-13 | Attempt deadline has passed | Lazily expire and reject submit | 409 ATTEMPT_EXPIRED | E2E with fake clock |
| EC-14 | Quiz archived after attempt start | Existing attempt remains usable until expiry | 200 submit | E2E |
| EC-15 | Admin tries to edit a published quiz or its questions | Reject; open attempts keep scoring against their snapshots | 409 PUBLISHED_QUIZ_IMMUTABLE | E2E |
| EC-16 | User response accidentally includes correct field | Test must fail recursively | test failure | E2E security |
| EC-17 | Reused idempotency key with same payload | Return stored response | 200 | E2E |
| EC-18 | Reused idempotency key with different payload | Reject | 409 IDEMPOTENCY_KEY_REUSED | E2E |
| EC-19 | Options contain blank or duplicate values | Reject question create/update/publish | 400 INVALID_QUESTION_OPTIONS | Unit + E2E |
| EC-20 | Client registers with role ADMIN | Role ignored/rejected; user remains USER | 201 USER or 400 | E2E |
| EC-21 | Database unavailable | Liveness remains 200; readiness becomes 503 | 503 SERVICE_NOT_READY | Integration |
| EC-22 | Missing answers | Unanswered questions score as incorrect | 200 valid score | E2E |
| EC-23 | Correct answers are logged on failure | Must never occur | security violation | logger unit test |
| EC-24 | Attempt start hits partial unique-index race | Fetch and return winner attempt or map to conflict safely | 200 resumed | Concurrent integration |
| EC-25 | User starts a quiz after submitting a previous attempt | Create a new attempt (retake) | 201 | E2E |
| EC-26 | User starts a quiz after a previous attempt expired | Expire lazily, create a new attempt | 201 | E2E |
| EC-27 | User starts an archived quiz | Reject new attempt | 409 QUIZ_ARCHIVED | E2E |
| EC-28 | User starts an unpublished (draft) quiz | Reject | 409 QUIZ_NOT_PUBLISHED | E2E |

# 10. Acceptance Tests

The release MUST NOT be declared complete until these acceptance tests pass.

## Authentication and Authorization

- **AT-01:** Registering creates a `USER` with a hashed password.
- **AT-02:** A client-supplied `ADMIN` role cannot elevate privileges.
- **AT-03:** Login returns a valid JWT and safe user payload.
- **AT-04:** Invalid credentials return `401 INVALID_CREDENTIALS` without user enumeration.
- **AT-05:** A `USER` cannot access any admin quiz or question endpoint.

## Quiz Management

- **AT-06:** An admin can create, read, update, and safely delete a draft quiz.
- **AT-07:** An admin can add, update, and delete valid multiple-choice questions on a draft quiz.
- **AT-08:** Invalid option arrays and correct indices are rejected.
- **AT-09:** A quiz with zero questions cannot be published.
- **AT-10:** Publishing marks the quiz `PUBLISHED`, sets `publishedAt`, and makes it and its questions immutable.
- **AT-11:** Any attempt to add, update, or delete content of a published quiz is rejected with `409 PUBLISHED_QUIZ_IMMUTABLE`.
- **AT-12:** Archiving blocks new attempts but does not break an existing attempt.

## Attempt Start, Retakes, and Correct-Answer Security

- **AT-13:** A user can list only available published quizzes.
- **AT-14:** Starting a quiz creates an `IN_PROGRESS` attempt with a stored snapshot and returns safe questions.
- **AT-15:** Starting the same quiz again returns the same open attempt (`200`, `resumed: true`) and does not create another row.
- **AT-16:** The database partial unique index prevents two concurrent open attempts.
- **AT-17:** A recursive function scans the entire ATT-01/ATT-02 JSON response and asserts no key equals `correctOptionIndex`.
- **AT-18:** The repository/projection test verifies user-facing question reads do not include `correctOptionIndex`.
- **AT-19:** The response DTO contains only explicitly allowed user-facing question fields.
- **AT-38:** After an attempt is submitted, starting the same quiz creates a new attempt (`201`) and history shows both attempts as separate rows.

## Submission and Results

- **AT-20:** Valid answers produce the correct score and per-answer breakdown.
- **AT-21:** The score is returned in the same submit response.
- **AT-22:** Partial answers are accepted and omitted questions are scored incorrect.
- **AT-23:** Invalid question IDs and option indices reject the whole submission.
- **AT-24:** Duplicate question entries reject the whole submission.
- **AT-25:** A user cannot submit another user's attempt.
- **AT-26:** Two concurrent submit requests produce exactly one successful state transition.
- **AT-27:** A later duplicate submit returns `409`, unless it is a valid identical idempotent replay.
- **AT-28:** An expired attempt is lazily marked expired and cannot be submitted.
- **AT-29:** Archiving the quiz (the only permitted post-publish change) does not change an already-started attempt's questions or scoring.
- **AT-30:** Result history persists and returns the expected score and timestamps from the attempt snapshot.

## API Quality and Operations

- **AT-31:** All errors use the common error envelope and request ID.
- **AT-32:** Pagination contract is exact and validates limits.
- **AT-33:** Swagger includes auth, roles, requests, success responses, and errors.
- **AT-34:** `GET /health/live` succeeds without database access.
- **AT-35:** `GET /health/ready` reports database failure with 503.
- **AT-36:** Docker Compose starts API and PostgreSQL from a clean checkout.
- **AT-37:** CI runs lint, typecheck, unit tests, E2E tests, and build successfully against a PostgreSQL service container.

# 11. Security and Defense-in-Depth Requirements

## 11.1 Correct Answer Protection

Three independent layers are mandatory:

1. **Repository/projection layer:** user-facing reads explicitly select only ID, position, question text, and options — both from `Question` rows and from attempt snapshots.
2. **Response DTO serialization:** user question DTO has no correct-answer property and is mapped explicitly.
3. **Recursive E2E assertion:** the complete start/resume response is traversed recursively and fails if `correctOptionIndex` appears at any depth.

## 11.2 Authentication Security

- Passwords MUST be Argon2id-hashed.
- JWT secret MUST come from validated environment configuration.
- JWT expiration MUST be finite.
- `helmet` SHOULD be enabled.
- CORS MUST be explicit, not wildcard in a production profile.
- Register and login SHOULD have basic rate limiting.
- `.env` MUST NOT be committed.
- `.env.example` MUST contain placeholder values only.

## 11.3 Logging Security

The logger MUST redact:

- authorization header;
- password fields;
- JWT tokens;
- `correctOptionIndex`;
- raw attempt snapshots and any structure containing correct answers.

# 12. Observability and Operational Requirements

- Structured JSON logs SHOULD include request ID, method, path, status code, duration, and authenticated user ID where available.
- Every response SHOULD echo `x-request-id`.
- Readiness MUST verify the database.
- Prisma query logs MUST be disabled or safely configured in normal execution.
- No sensitive field may be logged.
- The README MUST explain liveness versus readiness.

# 13. Required Repository Files

```text
quiz-engine-api/
  .github/
    workflows/
      ci.yml
  docs/
    PRD.md
    architecture.md
    decisions/
      001-modular-monolith.md
      002-postgresql-and-prisma.md
      003-immutable-published-quizzes-and-attempt-snapshots.md
      004-atomic-attempt-submission.md
      005-correct-answer-defense-in-depth.md
  prisma/
    schema.prisma
    migrations/
    seed.ts
  src/
    common/
    infrastructure/
    modules/
      auth/
      users/
      quizzes/
      attempts/
    app.module.ts
    main.ts
  test/
    auth.e2e-spec.ts
    authorization.e2e-spec.ts
    quizzes.e2e-spec.ts
    attempts.e2e-spec.ts
    security.e2e-spec.ts
  .env.example
  .nvmrc
  .dockerignore
  .gitignore
  CLAUDE.md
  Dockerfile
  docker-compose.yml
  README.md
  package-lock.json
  package.json
  tsconfig.json
```

No `COMMIT_PLAN.md`, schema-template, or SQL-template file may exist outside `docs/PRD.md`, `prisma/schema.prisma`, and `prisma/migrations/`.

# 14. CLAUDE.md Contract

The repository MUST contain `CLAUDE.md` matching the approved v1.1 working contract (single snapshot strategy, specification precedence, security and attempt invariants, development discipline). `CLAUDE.md` is derived from this PRD and MUST NOT contradict it.

# 15. Git Commit Strategy and Development Transparency

Commit history is part of the deliverable. Claude Code MUST commit after every completed phase. Each commit MUST be coherent, runnable, and use Conventional Commits.

Recommended sequence:

1. `chore: establish project specification and repository contract`
2. `chore: scaffold NestJS project and quality tooling`
3. `feat(database): add Prisma schema and PostgreSQL migrations`
4. `feat(auth): implement JWT authentication and role guards`
5. `feat(quizzes): implement quiz and question management`
6. `feat(quizzes): add publish and archive lifecycle with immutability`
7. `feat(attempts): implement start resume retakes and lazy expiry`
8. `feat(attempts): add atomic submission scoring and history`
9. `test: add auth authorization quiz and attempt e2e coverage`
10. `docs: add Swagger README architecture and ADRs`
11. `chore: add Docker CI health checks and release validation`

Rules:

- Do not make one giant implementation commit.
- Do not commit broken intermediate states.
- Before each commit run the phase validation commands.
- Commit messages MUST describe the engineering change and follow Conventional Commits. They do not need to name the implementation tool.
- Do not squash the history before submission unless specifically requested.
- Generated migrations MUST be committed.
- Secrets, `.env`, coverage output, build output, and local database files MUST NOT be committed.

## AI-Assisted Development Transparency

AI-assisted implementation is permitted and SHALL be documented transparently:

- The repository MAY include `CLAUDE.md`, this PRD, and a short README section describing the AI-assisted engineering workflow.
- The README MUST include a Development Process section equivalent to:

```text
## Development Process

This project was developed using an AI-assisted engineering workflow.
The specification, architectural boundaries, acceptance criteria, and
review gates were defined before implementation. AI coding agents were
used to accelerate implementation, while all design decisions, security
constraints, tests, and final code were reviewed and validated by the
author.
```

- The candidate remains responsible for every architectural decision, security control, test, and line of submitted code.

# 16. Implementation Phases, Stop Lines, and Definition of Done

## Phase 0 — Contract Bootstrap

Deliverables:

- Add this PRD to `docs/PRD.md`.
- Add `CLAUDE.md` at the repository root.
- Remove any duplicate planning or schema-template files that would create parallel sources of truth.
- Create ADR placeholder files with the titles from Section 13.
- Add `.nvmrc` and `package.json` engines pinning the Node.js LTS version.
- Create an initial README stub including the Development Process disclosure from Section 15.
- Initialize Git and repository structure.

Definition of Done:

- Claude Code confirms it has read the PRD and CLAUDE.md.
- No application code is written before these contracts exist.

Commit:

```text
chore: establish project specification and repository contract
```

## Phase 1 — Scaffold and Quality Foundation

Deliverables:

- NestJS TypeScript project with strict mode.
- ESLint and Prettier.
- Validated configuration.
- Global validation pipe.
- Error filter and request ID middleware/interceptor.
- Pino-compatible logger with redaction.
- Dockerfile and PostgreSQL Docker Compose service.
- Liveness and readiness skeletons.

Validation:

```bash
npm ci
npm run lint
npm run typecheck
npm run build
```

Stop line: do not begin auth until all commands pass.

Definition of Done:

- App starts. `/health/live` is 200. Invalid required configuration fails startup.

## Phase 2 — Database and Authentication

Deliverables:

- Prisma schema and initial migration.
- Raw SQL migration for the partial open-attempt unique index.
- Seeded admin from environment variables (hash before insert).
- Register, login, current user.
- Argon2id password hashing.
- JWT strategy, role guard, decorators.
- Auth E2E tests.
- Environment-safety guard for destructive reset helpers (BR-52).

Validation (local development database only, per BR-52):

```bash
npx prisma validate
npx prisma migrate reset --force
npm run lint
npm run typecheck
npm run test -- auth
npm run test:e2e -- auth authorization
npm run build
```

Definition of Done:

- Public registration cannot create admin.
- Admin and user authorization is verified by E2E tests.

## Phase 3 — Quiz Domain (No Decision Gate — Strategy Is Locked)

Deliverables:

- Draft quiz CRUD.
- Question CRUD and validation.
- Publish rule requiring at least one question; `publishedAt` set transactionally.
- Published immutability enforcement (`409 PUBLISHED_QUIZ_IMMUTABLE`).
- Archive behavior.
- ADR-002 recorded for the locked snapshot strategy.

Validation:

```bash
npm run lint
npm run typecheck
npm run test -- quizzes
npm run test:e2e -- quizzes
npm run build
```

Definition of Done:

- Quiz cannot publish empty.
- Published content is immutable and tested.
- Archive behavior is tested.

## Phase 4 — Attempts, Snapshots, Atomic Submit, and History

Deliverables:

- User quiz list and preview.
- Start or resume attempt with snapshot creation at start.
- Retakes per BR-51.
- Database-enforced one open attempt, including the creation-race fallback.
- Lazy expiry with no scheduler.
- User-safe question projection and DTO from the snapshot.
- Atomic conditional submit in one transaction, including the `expiresAt` predicate.
- Scoring against the snapshot and answer persistence.
- Idempotency behavior.
- History and result detail from snapshots.

Validation:

```bash
npm run lint
npm run typecheck
npm run test -- attempts scoring
npm run test:e2e -- attempts security
npm run build
```

Mandatory stop line:

- Once mandatory attempt flows, retakes, duplicate protection, history, and correct-answer security pass, stop adding product features.
- Do not start optional audit logs, randomization, refresh tokens, or analytics before tests and documentation are complete.

Definition of Done:

- All AT-13 through AT-30 and AT-38 pass.
- Concurrent start and submit behavior is covered.
- No correct answer is exposed before submission.

## Phase 5 — Documentation, Swagger, CI, Seed, and Release Quality

Deliverables:

- Complete Swagger/OpenAPI.
- README with setup, demo credentials, architecture, API flow, assumptions, trade-offs, the locked snapshot strategy, limitations, future improvements, and the Development Process disclosure.
- Architecture document and four ADRs.
- Unit and E2E tests.
- GitHub Actions CI with a PostgreSQL service container: the E2E job MUST provision PostgreSQL, wait for readiness via healthcheck, apply migrations, seed required fixtures, then run E2E tests. Reference configuration:

```yaml
services:
  postgres:
    image: postgres:16-alpine
    env:
      POSTGRES_USER: quiz
      POSTGRES_PASSWORD: quiz
      POSTGRES_DB: quiz_test
    ports:
      - 5432:5432
    options: >-
      --health-cmd "pg_isready -U quiz -d quiz_test"
      --health-interval 5s
      --health-timeout 5s
      --health-retries 10
```

- Multi-stage Dockerfile.
- Demo seed (local only): one admin user, one normal user, one published quiz with at least five questions, one draft quiz. Demo credentials (`admin@example.com`, `user@example.com`) MUST be documented in the README and clearly marked development-only; passwords MUST be obviously demo-only and never reused in production.
- Clean `.env.example`.

Validation:

```bash
npm ci
npm run format:check
npm run lint
npm run typecheck
npm run test
npm run test:e2e
npm run build
docker compose up --build -d
docker compose ps
```

Definition of Done:

- CI is green.
- A clean checkout starts with documented commands.
- Swagger is usable.
- Git history is staged and readable.
- No secrets or generated junk are committed.

# 17. Final Release Definition of Done

The project is ready for submission only when all conditions are true:

1. Core assignment functionality is complete.
2. All mandatory business rules are implemented.
3. The locked snapshot strategy (published immutability + attempt snapshots) is complete and documented in ADR-002 and the README.
4. Retakes work and every attempt is tracked (BR-51, AT-38).
5. One open attempt is database-enforced.
6. Atomic duplicate-submit protection is tested under concurrency.
7. Lazy expiry is implemented with no scheduler.
8. Correct answers are protected by all three defense layers.
9. Unit and E2E tests pass.
10. Lint, typecheck, and build pass.
11. Docker Compose starts from a clean checkout.
12. Swagger documents every mandatory endpoint.
13. README includes setup, trade-offs, and the Development Process disclosure.
14. CI is green.
15. Commit history follows the required phase structure.
16. The repository contains no secret, `.env`, local database, build output, or coverage artifact.
17. The final manual smoke flow succeeds:

```text
admin login
-> create quiz
-> add questions
-> publish
-> verify published quiz rejects edits
-> user register/login
-> list quiz
-> start attempt
-> verify no correct answers
-> submit
-> receive score and breakdown
-> view history
-> retry submit and receive 409 or valid idempotent replay
-> start the same quiz again and receive a new attempt (retake)
```

# 18. Future Improvements — Document, Do Not Implement Before Core Completion

The README MAY list these as future improvements:

- Full `QuizVersion` entities with republishing and version-bound attempts.
- Refresh-token rotation and revocation.
- Email verification and password reset.
- Admin audit log.
- Question and option randomization with stable mappings.
- Advanced quiz analytics.
- Scheduled cleanup of old idempotency records.
- Outbox pattern for future service extraction.
- Separate Auth, Quiz Catalog, and Attempt services when scale and team ownership justify it.
- Dedicated caching only after profiling demonstrates a need.
- OpenTelemetry metrics and traces.

These are documentation items, not current implementation requirements.
