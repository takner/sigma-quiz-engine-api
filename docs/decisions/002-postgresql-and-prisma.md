# ADR 002: PostgreSQL and Prisma

Status: Accepted

## Context

The API needs relational constraints for users, quizzes, questions, attempts, attempt answers, and idempotency records. It also needs race-safe attempt creation and submission behavior.

## Decision

Use PostgreSQL 16 as the only database and Prisma as the application ORM/migration tool. Use Prisma migrations for normal schema changes and raw SQL migrations where PostgreSQL features are required but Prisma schema syntax cannot represent them.

The open-attempt uniqueness rule is enforced by a PostgreSQL partial unique index over `(userId, quizId)` for attempts whose status is `IN_PROGRESS`.

## Consequences

PostgreSQL provides transactional guarantees, JSON snapshot storage, uniqueness constraints, and partial indexes needed by the PRD. Prisma keeps application data access typed and reviewable.

Raw SQL migration files are part of the source-controlled schema contract and must be reviewed with the Prisma schema.
