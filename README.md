# Quiz Engine API

Backend API implementation for the SiGMA NodeJS Developer Challenge.

Current status: Phase 1 scaffold and quality foundation. Domain implementation, Prisma schema, authentication, quiz management, attempts, Swagger completion, and CI are intentionally deferred to later approved phases.

## Local Development

Use Node.js `24.18.0`, then install dependencies and run the API:

```bash
npm ci
npm run start:dev
```

Docker Compose provides a local PostgreSQL service and API container because `docs/PRD.md` Section 16 lists "Dockerfile and PostgreSQL Docker Compose service" as a Phase 1 deliverable. The Phase 1 API does not connect to PostgreSQL yet.

```bash
docker compose up --build
```

## Health Checks

- `GET /api/v1/health/live` confirms the API process is running.
- `GET /api/v1/health/ready` confirms the application bootstrapped with valid environment configuration. Phase 1 readiness does not connect to PostgreSQL.

## Normative Specification

- `docs/PRD.md` is the single normative source of truth.
- Approved ADRs are subordinate to the PRD.
- `CLAUDE.md` is the working contract derived from the PRD.

## Development Process

This project was developed using an AI-assisted engineering workflow.
The specification, architectural boundaries, acceptance criteria, and
review gates were defined before implementation. AI coding agents were
used to accelerate implementation, while all design decisions, security
constraints, tests, and final code were reviewed and validated by the
author.
