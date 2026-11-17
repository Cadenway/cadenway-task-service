---
paths:
  - '**/*.spec.ts'
  - 'src/**/*.int-spec.ts'
  - 'tests/**'
---

# Tests

- Vitest. Specs sit next to their subject; integration specs end in `.int-spec.ts` and run with
  `pnpm test:integration`.
- Domain tests are pure. Use real PostgreSQL and NATS from `@cadenway/nest-testing` when
  the behavior depends on them.
- Pick the test that would fail with the regression. For example, use a domain test for a
  refused status transition, PostgreSQL for rollback when outbox insertion fails, and NATS
  for the observable effect of redelivery.
- Use the [focused gate](../../docs/development.md#full-local-quality-gate). Report the executed
  test count. Zero tests leaves the behavior unverified.
- Name tests after the behavior and the rule (`refuses a milestone with an estimate`).
- Fixtures come from the mockup data: Atelier Nord, Camille Martin (CM), Sprint 14, CAD-482.
- Never mock the database in an integration test; never assert on log text.
