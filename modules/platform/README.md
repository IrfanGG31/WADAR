# `platform` module

Outbox, idempotency, audit log, and health checks — the foundation every other
module builds event publishing/consuming on top of. See `docs/ARCHITECTURE.md`
§3–§4, §8 and `docs/BUILD-PLAN.md` M0 for the full design.

## Guarantee: at-least-once delivery, exactly-once *effect* — not exactly-once delivery

The outbox relay can and will redeliver an event more than once (crash between
enqueue and marking a row `published`, BullMQ retry, etc.). That is expected
and correct (ADR-005). What's guaranteed is that the **net effect** of
processing happens exactly once, via `processed_events`' composite primary
key (`consumer`, `event_id`) — see `infra/processed-events.repository.ts`.

**This guarantee is airtight only when a consumer's effect is itself a DB
write**, because `tryClaimProcessing` and the handler's effect run in the same
transaction (`application/idempotent-consumer.ts`). For a consumer whose
effect is a non-transactional external call — sending a WhatsApp message
(M9), calling an LLM (M8) — this pattern **reduces** duplicates but does not
**eliminate** them: the transaction can still commit and then the process
crashes before the external call would have been skipped on redelivery.
Modules with that shape need their own idempotency at the external provider's
boundary (e.g. WhatsApp's own message dedupe, or storing "already sent" before
calling out).

## What's deliberately deferred past M0

- **LISTEN/NOTIFY**: ARCHITECTURE §4.3 mentions it alongside polling. M0 only
  implements 250ms polling — LISTEN/NOTIFY is a latency optimization, not a
  correctness requirement, and isn't needed to satisfy the M0 DoD.
- **OpenTelemetry OTLP export**: console exporter only until there's a real
  backend to send to.
- **OpenAPI generation** from `@wadar/contracts` Zod schemas: deferred to M1+
  (see `docs/adr/001-custom-zod-validation-pipe.md`).
- **DLQ alerting**: the dead-letter queue mechanism exists and works from M0
  (`infra/queues.ts`), but alerting on DLQ depth is M11 scope.

## `dependency-cruiser` limits — what static analysis can't catch

The repo's `.dependency-cruiser.cjs` enforces module boundaries on *static
imports*. It cannot catch:

- Cross-module access via NestJS dependency injection (injecting another
  module's internal service through the DI container without a static
  `import` of that module's files) — there's no import edge to see.
- Cross-schema access via a raw SQL string literal (e.g.
  `` sql`SELECT * FROM other_module.table` ``) — same reason.
- `apps/**` containing business logic instead of composing modules — this is
  a code-review item, not a lint rule.

These stay manual-review items for now. A per-module Postgres role with
schema-scoped `GRANT`s is a candidate defense-in-depth for the SQL-literal
case specifically, noted here for a later milestone rather than built in M0.

**Partially addressed in M1** (`docs/adr/002-postgres-role-separation-for-rls.md`):
runtime traffic now goes through `wadar_app`, a non-superuser role with
`NOBYPASSRLS` — so a cross-module raw SQL literal is still caught by RLS at
the row level (it can't read/write another tenant's data), but it is NOT
caught at the *schema* level (`wadar_app` has DML grants across every
module's schema, not scoped per-module) — that part of this note's original
"candidate defense-in-depth" is still open for a later milestone if it turns
out to matter in practice.
