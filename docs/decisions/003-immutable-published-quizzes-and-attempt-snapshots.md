# ADR 003: Immutable Published Quizzes and Attempt Snapshots

Status: Accepted

## Context

The assignment requires quiz history to remain reproducible while keeping the implementation small enough for a modular monolith submission. The approved PRD explicitly rules out full `QuizVersion` entities for this submission.

## Decision

Published quizzes are immutable. After publication, quiz metadata that affects content and all question create/update/delete operations are rejected with `409 PUBLISHED_QUIZ_IMMUTABLE`. Archiving is the only permitted lifecycle change after publication.

When a user starts an attempt, the application stores a question snapshot on the attempt row. That snapshot includes the answer key for server-side scoring, but user-facing responses must project only safe fields and must never serialize `correctOptionIndex`.

Full `QuizVersion` entities are out of scope for this submission. The attempt snapshot is the locked scoring contract for the attempt.

## Consequences

This keeps the data model simple while protecting submitted results from later edits, archive operations, and future migrations. It also gives the attempts module a stable scoring source without introducing `QuizVersion` and `QuizVersionQuestion` tables.

Republishing edited quiz content is out of scope. A future versioning design can add explicit version entities if product requirements later require mutable published quizzes or multiple published revisions.

The attempts module must treat snapshots as sensitive server-side data and expose only projected fields: `id`, `position`, `questionText`, and `options`.
