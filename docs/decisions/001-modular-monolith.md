# ADR 001: Modular Monolith

Status: Accepted

## Context

The PRD requires a backend API submission with strict scope control. The system needs authentication, quiz management, attempt lifecycle behavior, scoring, history, health checks, Swagger, tests, Docker, and CI, but it does not require independent deployment units or asynchronous processing.

## Decision

Build a NestJS modular monolith. Keep all application modules in one API process and one repository. Organize code by functional module boundaries: auth, users, quizzes, attempts, infrastructure, and common cross-cutting utilities.

Do not introduce microservices, message brokers, background workers, schedulers, GraphQL, Redis, Kubernetes configuration, or a frontend for this submission.

## Consequences

The monolith keeps local development, testing, transactions, and deployment simple. Cross-module workflows such as atomic submission can use one Prisma transaction without distributed coordination.

Future decomposition remains possible if product requirements demand separate scaling or ownership, but this submission optimizes for correctness, reviewability, and small operational surface area.
