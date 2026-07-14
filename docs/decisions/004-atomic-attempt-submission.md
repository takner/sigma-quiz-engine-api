# ADR 004: Atomic Attempt Submission

Status: Accepted

## Context

Submitting an attempt changes multiple records: the attempt status and score, answer rows, and an optional idempotency record. Concurrent submit requests must not double-score or create duplicate answer rows.

## Decision

Submit attempts inside one Prisma transaction. Within the transaction:

1. Normalize and hash the submit payload.
2. Check any existing idempotency record for the same user/key.
3. Load the attempt and verify ownership and current state.
4. Score answers against the stored attempt snapshot.
5. Perform an atomic conditional `updateMany` requiring the attempt ID, user ID, `IN_PROGRESS` status, and non-expired deadline.
6. Insert answer rows for provided answers only.
7. Store the successful idempotency response in the same transaction when an idempotency key is present.

If the conditional update affects zero rows, resolve the final error by re-reading the attempt in the same transaction and returning the precise not-found, forbidden, already-submitted, or expired outcome.

Idempotency records are retained for 24 hours. This is an implementation assumption for this submission; no background cleanup job is included.

## Consequences

The transaction keeps status transition, scoring, answer persistence, and idempotency persistence consistent. Concurrent submissions converge on one successful state transition and one losing conflict response.

The 24-hour retention window keeps replay behavior bounded but leaves expired-record cleanup as a future operational improvement.
