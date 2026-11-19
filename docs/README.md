# cadenway-task-service documentation

Planned role: cadenway-task-service owns the core of the product. NestJS, its own PostgreSQL database (one database with a migrator role and an application role in the shared PostgreSQL of the VPS), events over NATS JetStream through `@cadenway/nest-messaging`, internal REST for the API gateway. Local port 3013.

## Current status

The NestJS application under `src/` runs on `@cadenway/nest-common` and `@cadenway/nest-messaging`: configuration validated at start-up, JSON logs, OpenTelemetry preloaded, the internal token required on every route but the health probes, the NATS connection of the `task` user with the outbox relay, and a readiness route that checks PostgreSQL and NATS. The migrations create the tables of the service kit (outbox, processed ids, versions, `Idempotency-Key`), owned by the platform module, the copy of the organization memberships of the organization-members module, fed by the member events of organization-service through the member-lifecycle module, the spaces, their prefixes and their lists of the spaces module, and the tasks with their subtasks, assignees, labels, checklist and activity log of the tasks module. The internal routes of the spaces, the lists and the tasks exist, and the service publishes `space.*`, `list.*` and `task.*` through its outbox. The spaces module serves the grants of spaces and lists and applies the effective role of each person to every route, the access-requests module the requests for access and their answers, and the realtime gateway checks access through two routes of its own. The tasks module also serves the seven task queries (the tasks of a list with filters and sorts, the group counts, the counts of a list, the overview of a space, the labels, "Mes tâches" and "Accueil"). The target architecture in this guide is what the next modules must follow.

## Read the guides

- [Architecture and ownership](architecture.md): boundaries and planned repository structure.
- [Development and checks](development.md): prerequisites, planned commands and verification.
- [Domain and integration](integration.md): repository-specific contracts, behavior and dependencies.

## Sources and policy

- [Repository overview](../.github/README.md) and [contribution guide](../.github/CONTRIBUTING.md).
- [Repository instructions and hard limits](../AGENTS.md).
- [Claude Code instructions](../CLAUDE.md) and [tooling](../.claude/README.md).
- [Codex tooling](../.codex/README.md).
- [Interactive mockup](https://claude.ai/artifact/KYRM7AnsYLiBLBLKy8i4HE), [integration guide](https://claude.ai/artifact/CpJHVCiFfF9j3KbHQ2S1Et), and [repositories and packages](https://claude.ai/artifact/BPinmYxoF3mbK8w9BMB43N).

Repository instructions take precedence over this summary. Refer to the actual package manifests, implementation, specifications, and workflows once they exist; do not infer a deployed feature from a target design.
