# CLAUDE.md — Quiz Engine API

## Authority and Precedence
This file is derived from `docs/PRD.md`. Do not improvise product behavior that is already specified.

Specification precedence:
1. `docs/PRD.md` (single normative source of truth)
2. Approved ADRs
3. `CLAUDE.md`
4. Implementation code and migrations

If implementation conflicts with the PRD, or a requirement is ambiguous or missing, stop and report it to the operator. Never resolve it through autonomous assumption.

## Architecture
- Build one NestJS modular monolith.
- Modules: auth, users, quizzes, attempts.
- Controllers handle HTTP only.
- Services own business rules.
- Prisma access stays in repositories/services, never scattered through controllers.
- Do not create real microservices or extra repositories.

## Naming
- TypeScript files: kebab-case.
- Classes and types: PascalCase.
- Variables and functions: camelCase.
- Database models: PascalCase singular.
- API JSON fields: camelCase.
- Error codes: UPPER_SNAKE_CASE.

## API Contract
- Base path: `/api/v1`.
- Dates: UTC ISO 8601.
- IDs: UUID.
- Lists use the PRD pagination envelope.
- Errors use the nested PRD error envelope: `{ statusCode, error: { code, message, details, requestId, timestamp, path } }`.
- Error `details` is always an array, possibly empty, never null.
- Scores use `{ correct, total, percentage }`.
- Health endpoints are `/api/v1/health/live` and `/api/v1/health/ready`.

## Security Invariants
- Public registration always creates USER.
- Public registration rejects a submitted `role` or any other unknown property with 400 VALIDATION_ERROR.
- Never return password hashes.
- Never return `correctOptionIndex` in any user-facing response, including successful submit results and history.
- User-facing repository queries and snapshot projections must not include `correctOptionIndex`.
- User-facing DTOs must not define `correctOptionIndex`.
- E2E tests must recursively scan user-facing attempt responses for `correctOptionIndex`.
- Never log passwords, tokens, correct answers, or raw attempt snapshots.

## Quiz Content Strategy (LOCKED — do not reconsider)
- Lifecycle: DRAFT (editable) → PUBLISHED (immutable) → ARCHIVED (no new attempts).
- A quiz needs at least one valid question before publish; publishing sets `publishedAt`.
- A PUBLISHED quiz and its questions are immutable; modification returns 409 PUBLISHED_QUIZ_IMMUTABLE.
- Archived quizzes reject new attempts (409 QUIZ_ARCHIVED); existing open attempts survive archive until submit or expiry.
- At attempt start, store an immutable snapshot of quiz title and questions (including correct indices) on the attempt.
- All question serving and scoring uses the attempt snapshot, never current quiz rows.
- Full QuizVersion entities are out of scope for this submission.

## Attempt Invariants
- One IN_PROGRESS attempt per user per quiz, enforced by PostgreSQL partial unique index.
- Starting again with an open attempt returns the same attempt (200, resumed: true).
- Retakes are always allowed after SUBMITTED or EXPIRED: create a new attempt row (201) with a fresh snapshot.
- If attempt creation loses the unique-index race, load and return the winning open attempt.
- No cron or scheduler for expiry; evaluate lazily on start, read, submit, and history.
- Submit uses an atomic conditional update on `status = IN_PROGRESS` AND (`expiresAt` IS NULL OR `expiresAt` > NOW()) inside a transaction; inspect the affected-row count.
- Duplicate submit returns 409 unless serving an identical idempotent replay.
- Score is computed server-side from the snapshot and returned in the same submit response.
- Submit response breakdown includes `questionId`, nullable `selectedOptionIndex`, `answered`, and `isCorrect`; it never includes the answer key.
- Omitted answers are incorrect, appear in the response breakdown, and do not create AttemptAnswer rows.
- Attempt statuses are only IN_PROGRESS, SUBMITTED, and EXPIRED.
- Idempotency-Key applies only to attempt submission, is scoped by authenticated user, and is stored transactionally with request hash and successful response.

## Validation and Access Resolutions
- Use the exact PRD validation bounds for passwords, quiz fields, questions, options, time limits, and pagination.
- Validate UUID path parameters at controller boundaries; malformed UUIDs return 400 VALIDATION_FAILED with field-level details.
- Validate UUID-shaped query parameters before they reach Prisma; malformed UUID query filters return 400 VALIDATION_FAILED with field-level details.
- Default ordering: published quizzes by publishedAt DESC, admin quizzes by updatedAt DESC, questions by position ASC, history by startedAt DESC, answer breakdown by snapshot order.
- `/auth/me` allows any authenticated account.
- Admin quiz/question management is ADMIN only.
- User quiz listing, attempts, results, and history are USER only; admins do not bypass user endpoint role or ownership rules.
- `@nestjs/throttler` is approved only for in-memory registration and login rate limiting.
- CORS is environment-driven; production requires an explicit non-empty allowlist.
- JWT is access-token-only with configurable `JWT_EXPIRES_IN`, default 3600.
- Admin creation is seed-only for development/test; no public admin creation endpoint.

## Environment Safety
- Do not run `prisma migrate reset --force` during Phase 0.
- Destructive reset helpers run only when NODE_ENV is development, DATABASE_URL points to localhost / 127.0.0.1 / the approved local Docker service `postgres`, and the database name is clearly development-specific.
- CI uses migration deployment against its disposable PostgreSQL service container, not the local reset helper.

## Non-Goals
Do not add Kafka, RabbitMQ, Redis without a demonstrated need, Kubernetes, GraphQL, full CQRS, Event Sourcing, multiple repositories, real microservices, complex OAuth, a frontend, or QuizVersion entities.

## Development Discipline
- Work phase by phase according to the PRD.
- Phase 0 commit message: `chore: establish project specification and repository contract`.
- After every phase: run formatting, lint, typecheck, relevant tests, and build.
- Commit each completed phase separately using Conventional Commits.
- Commit messages describe the engineering change; they do not need to name the implementation tool.
- Do not create one giant final commit.
- Never weaken a test to make it pass.
- Document any deviation in README and an ADR.
- AI-assisted development is documented transparently: the repo includes this file, the PRD, and a README Development Process section.
