# ADR 005: Correct Answer Defense in Depth

Status: Accepted

## Context

The API must store correct answers for admin management and server-side scoring, but user-facing quiz, attempt, submit, and history responses must never expose `correctOptionIndex`.

## Decision

Protect correct answers at multiple layers:

- User-facing Prisma queries select only safe fields where possible.
- Attempt responses are built from snapshot projection helpers that return only `id`, `position`, `questionText`, and `options` for questions.
- Submit and history responses report answer correctness and score breakdowns without including the correct option index.
- E2E tests recursively scan start, read, submit, and history response trees for any key named `correctOptionIndex`.
- A negative-control test proves the recursive scanner fails when a nested `correctOptionIndex` exists.
- HTTP logger redaction covers credentials, snapshots, and correct-answer fields.

Admin quiz management responses may include `correctOptionIndex` because admins need to create, review, and edit draft questions.

## Consequences

The API has more than one protection point: query shape, response projection, recursive tests, and logging redaction. A future change that accidentally leaks answer keys through user-facing responses should fail tests before release.

Developers must treat attempt snapshots as sensitive data even though they are stored in the database as JSON.
