# Architecture and ownership

[Documentation index](README.md) · [Repository instructions](../AGENTS.md)

## Status

The checkout contains NestJS startup, health and configuration code. Business modules will follow the structure below as their capabilities are implemented.

## Purpose and target structure

cadenway-task-service owns the core of the product. NestJS, its own PostgreSQL database (one database and one user in the shared PostgreSQL of the VPS), events over NATS JetStream through `@cadenway/nest-messaging`, internal REST for the API gateway. Local port 3013.

|            |                                                                                                                                                                                                                                                                                                      |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Data       | Spaces (appearance, privacy, renamed or hidden statuses), lists and sprints, tasks, subtasks, checklist, dependencies, milestones, recurrence, labels, custom fields, templates, saved views, comments, time entries, approvals, activity log, goals and key results, intake forms, trash, archives. |
| API        | All of the above. A status change accepts a source (`user`, `automation`, `git`) so the activity log can sign it "par GitHub".                                                                                                                                                                       |
| Emits      | `space.*`, `list.*`, `task.created`, `task.updated`, `task.status-changed`, `task.assigned`, `task.trashed`, `task.restored`, `task.purged`, `comment.created`, `approval.requested`, `approval.decided`, `milestone.reached`                                                                        |
| Listens to | `organization.deleted`, `member.removed` (unassigns the member)                                                                                                                                                                                                                                      |
| External   | None.                                                                                                                                                                                                                                                                                                |
| Phase      | First version                                                                                                                                                                                                                                                                                        |

At start-up this service also carries documents, attachments metadata and automation rules as modules; they are extracted later into their own repositories.

## Architectural ownership

Follow the [Cadenway NestJS architecture reference](https://github.com/Cadenway/cadenway-service-kit/blob/main/docs/hexagonal-architecture.md) for module structure, dependency direction, naming and test placement.

- Business code lives in modules under `src/modules/<module>/`, each with `domain/`, `application/`, `infrastructure/`, `api/` and a `MODULE.md`.
- Cross-cutting plumbing (config, logging, tracing, errors, auth guards, messaging) comes from the cadenway-service-kit packages (`@cadenway/nest-common`, `@cadenway/nest-messaging`); development-only `@cadenway/nest-testing` is maintained in [cadenway-tooling](https://github.com/Cadenway/cadenway-tooling).
- The domain is pure; use cases own transactions; controllers and handlers translate.
- Rendering of anything user-facing belongs to the webapp; this service returns data and stable error codes.

## Boundaries

- No access to another service's database or internal code; cross-service needs use `@cadenway/contracts` routes or events.
- NATS only through `@cadenway/nest-messaging`; config, logs, errors, health and auth guards through `@cadenway/nest-common`.
- Routes and event payloads come from the installed `@cadenway/contracts`; never redefine them locally.
- The service is internal: no Traefik label, no public route; the API gateway is its only HTTP caller.
- No sibling sources imported, no `file:` or `link:` dependency on a sibling.

## Cross-repository changes

Each checkout owns its implementation and release. Use published `@cadenway/*` packages instead of sibling source imports or local dependency links. For contract changes, make the contract and generated package available first, then update the producing service, gateways and listeners, and finally the webapp. Each step should remain deployable independently.

## Architecture checks

`pnpm test:architecture` runs the service profile from [`@cadenway/nest-testing`](https://github.com/Cadenway/cadenway-tooling) against this repository's TypeScript configuration. It runs locally as part of `pnpm quality` and in the GitHub Actions quality gate.
