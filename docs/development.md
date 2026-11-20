# Development and verification

[Documentation index](README.md) · [Repository overview](../.github/README.md) · [Repository instructions](../AGENTS.md)

## Bootstrap status

The application under `src/` runs on `@cadenway/nest-common` and `@cadenway/nest-messaging`: its
configuration is validated when the application is created, a failed start-up is one JSON line on
the standard error, it writes JSON log lines, starts OpenTelemetry before the application, requires
the internal token on every route but the health probes, connects to NATS as the `task` user, runs
the outbox relay, and its readiness checks PostgreSQL and NATS. The migrations create the tables
of the service kit, owned by the platform module (`src/modules/platform/MODULE.md`), and the copy of
the organization memberships (`src/modules/organization-members/MODULE.md`), which three durable
consumers of `EVENTS` feed from the member events of organization-service
(`src/modules/member-lifecycle/MODULE.md`), and the spaces, prefixes and lists
(`src/modules/spaces/MODULE.md`), whose internal routes exist and whose `space.*` and `list.*`
events leave through the outbox, and the tasks with their subtasks, assignees, labels, checklist
and activity log (`src/modules/tasks/MODULE.md`), whose internal routes exist and whose `task.*`
events leave through the outbox; the removal of a member enqueues, in the transaction of
`member.removed.v1`, a job of `@cadenway/nest-jobs` that hands their private spaces over, then
removes their grants of spaces and lists and drops their access requests, then unassigns them
from their tasks, in batches. The grants of spaces and lists (`src/modules/spaces/MODULE.md`) and
the access requests (`src/modules/access-requests/MODULE.md`) have their internal routes, and every
route applies the effective role of the caller; the realtime gateway checks the access to a list or
a task through two routes of its own. Lists and tasks are archived and restored, a task with its
subtree, and the pages "Archives" list them (`src/modules/spaces/MODULE.md`,
`src/modules/tasks/MODULE.md`). A deleted task goes to the trash with its live subtree as one entry,
which the page "Corbeille" lists and which is restored or erased as a whole; a deleted list or space
becomes a tombstone whose tasks a job moves to the trash, and the trash is erased 30 days after a
deletion by a daily job, or at once by "Vider la corbeille" (`src/modules/tasks/MODULE.md`,
`src/modules/spaces/MODULE.md`, `src/modules/deletion-lifecycle/MODULE.md`). The tasks module also serves the seven task queries (the tasks of a list, the group counts, the counts of a list, the overview of a space, the labels, "Mes tâches" and "Accueil"). The target architecture in this guide is what
the next modules must follow.

The commands below are the documented workflow. Inspect the repository's actual manifests and files before running them, and report unavailable checks rather than inventing replacements. Run Git, pnpm, build, and test commands with this repository as the working directory, never from the parent workspace.

## Before making a change

- The `MODULE.md` of the module you touch, and `src/app.module.ts` for the module list.
- `@cadenway/contracts` (installed) and `../cadenway-api-contracts`: `openapi/internal/task-service.yaml` and `asyncapi/task-service.yaml`.
- The [repositories document](https://claude.ai/artifact/BPinmYxoF3mbK8w9BMB43N), section "cadenway-task-service", and the data model of the [integration guide](https://claude.ai/artifact/CpJHVCiFfF9j3KbHQ2S1Et).
- The mockup screens this service serves: Every space view (list, board, calendar, Gantt, workload, sheet, intake form, activity, timesheet), the task detail and creation, Home, My tasks, Dashboards, Goals, Trash, Archives.
- `package.json` for versions and scripts once the repository is bootstrapped. Do not restate
  versions elsewhere: a copy goes stale.

## Setup

Requirements: Node.js LTS and pnpm (versions in `package.json`), and Docker.

1. Clone this repository next to the other Cadenway repositories, flat, in one folder.
2. To run it with the rest of Cadenway, start the stack from `cadenway-ops`; it builds the sibling
   folders, this one included. Follow its `docs/development.md`:

   ```bash
   cd ../cadenway-ops/compose
   cp .env.example .env                        # once
   docker compose run --rm internal-token-keys # once: the key pairs of the internal token
   docker compose up -d
   ```

3. To work on this repository alone, against its own PostgreSQL and NATS:

   ```bash
   pnpm install
   cp .env.example .env                        # once
   docker compose -f compose.dev.yaml up -d --wait
   pnpm migration:run                          # as task_migrator; again after a pull that adds one
   pnpm start:dev                              # http://localhost:3013/health/ready
   ```

   `compose.dev.yaml` gives PostgreSQL the two roles of cadenway-ops: `task_migrator` owns the
   database and runs the DDL, `task_app` runs the service under row-level security. They are
   created on an empty volume; recreate an older one once with
   `docker compose -f compose.dev.yaml down --volumes`. When 5432 or 4222 is taken, start the stack
   with `DEV_POSTGRES_PORT` or `DEV_NATS_PORT` and change the URLs of `.env` to match.

   Its NATS has the authorization of the broker of cadenway-ops (`docs/messaging.md` there): a
   connection without a user is refused, and the `task` user may publish the subjects of the
   entities this service owns and subscribe to `_INBOX.task.>` and `rebuild.task.>` only.
   `nats-streams` runs the stream script of cadenway-ops with the `admin` user: it creates
   `EVENTS`, `EVENTS_RESTRICTED` and `EVENTS_DLQ` once NATS is healthy, checks them every minute
   and is healthy while they exist. The service never creates a stream and refuses to start
   without `EVENTS`. To look at the streams:
   `docker compose -f compose.dev.yaml exec nats-streams nats stream ls`.

`pnpm start:dev` loads `.env` and starts the process the way the image does:
`node --max-old-space-size=160 --import @cadenway/nest-common/register --import ./dist/telemetry.js`
before `dist/main.js`. The register entry point installs the OpenTelemetry module hooks without an
`ExperimentalWarning`, `telemetry.js` starts the SDK, and the heap cap keeps the old generation at
about 60 % of the 256M of the container. The two commands carry the same flags and change together.

## Configuration

Validated at start-up against the schema of `src/config/app-config.ts`, inside `runApplication`: a
missing or invalid variable stops the process with one JSON line whose `issues` name it, never its
value. `.env.example` holds a working local value for each;
[cadenway-ops](https://github.com/Cadenway/cadenway-ops) (`docs/service-environment.md`) says where
each value comes from on a server.

| Variable                              | Read by               | Value                                                                                                                                                     |
| ------------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PORT`                                | The service           | `3013`                                                                                                                                                    |
| `NODE_ENV`, `LOG_LEVEL`, `LOG_PRETTY` | The service           | `production`, `info` and `false` when unset                                                                                                               |
| `DATABASE_URL`                        | The service           | Application role `task_app`                                                                                                                               |
| `MIGRATION_DATABASE_URL`              | `src/migrate.ts` only | Migrator role `task_migrator`; required once a migration exists. The GitOps agent passes it to the migration container only, never to the running service |
| `INTERNAL_TOKEN_AUDIENCE`             | The service           | `task-service`                                                                                                                                            |
| `INTERNAL_TOKEN_TRUSTED_ISSUERS`      | The service           | One line of JSON: the public keys of each backend allowed to call it                                                                                      |
| `OTEL_EXPORTER_OTLP_ENDPOINT`         | `src/telemetry.ts`    | OTLP over HTTP; unset, nothing leaves the process                                                                                                         |
| `NATS_URL`                            | The service           | `nats://` URL of the broker                                                                                                                               |
| `NATS_USER`, `NATS_PASSWORD`          | The service           | User `task` and its password; inbox prefix `_INBOX.task`                                                                                                  |
| `TRASH_WRITES_ENABLED`                | The service           | `false` when unset: the writes of the trash answer `404` ("Trash writes" below); `true` to serve them                                                     |

### Trash writes

The release that brings the trash (`migrations/0007_trash.sql`) reads it everywhere, but creates trash
entries and tombstones only once `TRASH_WRITES_ENABLED` is `true`. While it is `false` (the default),
"Supprimer la tâche" (`POST /internal/v1/tasks/{taskKey}/trash`), `DELETE /internal/v1/lists/{listId}`,
`DELETE /internal/v1/spaces/{spaceId}` and "Vider la corbeille" (`POST /internal/v1/trash/empty`) answer
`404 http.not-found`, as the release before, which has no such route; the restoration and the erasure of
an entry, the trash page and the jobs are always served. The release before ignores `trash_entry_id` and
`deleted_at`: it would show the trash and the deleted lists and spaces as live. So:

- Before first activation, the expanded schema remains compatible with the previous release.
  Finish rolling out the worker that supports `0008_trash_root_snapshot.sql` before setting
  `TASK_SERVICE_TRASH_WRITES_ENABLED=true` in cadenway-ops.
- Record that release as the environment's minimum rollback target as soon as the switch is
  enabled. A worker built before it cannot resume a partially erased entry after the root goes
  away. Turning off writes after activation keeps the existing jobs running, so retain a
  worker that supports this migration.

Turn it on locally to try the trash; the integration tests of the trash run with it on.

### Calling the service locally

Every route but `/health/*` requires an internal token. The key in `.env.example` is a placeholder
whose private half was discarded: the service starts, and every call answers 401. To call it, get a
key pair from cadenway-ops, never from this repository:

```bash
cd ../cadenway-ops/compose
docker compose run --rm internal-token-keys --print   # prints fresh pairs on the terminal only
```

Put the `API_GATEWAY_INTERNAL_TOKEN_PUBLIC_JWKS` value inside the array of
`INTERNAL_TOKEN_TRUSTED_ISSUERS` in `.env` (`{"api-gateway":[<value>]}`) and restart. Then sign a
token, valid 60 seconds, with the matching private key, from this repository's root:

```bash
PRIVATE_JWK='<API_GATEWAY_INTERNAL_TOKEN_PRIVATE_JWK>' node --input-type=module -e '
import { InternalTokenSigner } from "@cadenway/nest-common";
const signer = await InternalTokenSigner.create({
  issuer: "api-gateway",
  privateJwk: JSON.parse(process.env.PRIVATE_JWK),
});
console.log(await signer.sign("task-service", {
  actor: { type: "user", id: "01938f6e-8a42-7d5b-b2c9-5e1f3a6d9c24" },
  organizationId: "01938f6e-6d1a-7c3e-9a51-2f0c4b8d7e10",
}));'
```

and send it as `Authorization: Bearer <token>`. Use a workstation key only: the keys of staging and
production stay in the secrets of cadenway-ops.

### Migrations

`pnpm migration:generate` writes the migrations from the `*.schema.ts` files of the modules
(`pnpm migration:generate --name <what_it_does>` names the file). drizzle-kit enables row-level
security on a table with a policy but never forces it: add
`ALTER TABLE "<table>" FORCE ROW LEVEL SECURITY;` to the generated file for every new tenant table
before it is merged, then never edit it again. Extended statistics (`CREATE STATISTICS`), which a
schema cannot declare, are added the same way, with a comment saying why
(`migrations/0007_trash.sql`). `pnpm migration:run` builds and runs
`dist/migrate.js`, the command the GitOps agent runs in a one-off container before it starts a new
version; it connects as the migrator role of `MIGRATION_DATABASE_URL` and applies what the journal
does not list yet, then provisions the jobs with `provisionJobs` of `@cadenway/nest-jobs`: the
`pgboss` schema, created by `task_migrator` (which owns the database) and closed to every other
role, the queues of `src/config/job-queues.ts` with their dead-letter queues, and the runtime
grants of `task_app` on that schema. It is idempotent too, and the service refuses to start until
it ran (`JobsNotProvisionedError`). A pull that adds or changes a queue needs `pnpm migration:run`
again, like a new migration.

The tables of the service kit reach the migrations through the platform module: the outbox,
processed-ids and versions tables of `@cadenway/nest-messaging/outbox` and `idempotency_keys` of
`@cadenway/nest-common/database` are re-exported from
`src/modules/platform/infrastructure/persistence/`. A kit version that changes one ships a note
in its changeset: upgrade the package, generate, review the new migration.

### Integration tests

`pnpm test:integration` needs Docker. `tests/service-wiring.int-spec.ts` starts PostgreSQL, NATS
and `nats-streams` from `compose.dev.yaml` as a throwaway Compose project on free ports (the data
of the dev stack is never touched), applies the migrations with `src/migrate.ts` as the migrator
role, and assembles the application as `main.ts` does, as `task_app` and the NATS user `task`. It
checks the ownership and forced row-level security of the kit tables, the `pgboss` schema and
queues the migrator provisioned, that the application role reads and writes the rows of its
organization only and runs no DDL, in `public` or in `pgboss`, that the relay runs against an
empty outbox, that the broker enforces the permissions of cadenway-ops, the health routes (readiness
503 while NATS or PostgreSQL is down and from the start of a shutdown, back to 200 once NATS
returns) and the internal token. `tests/organization-members.int-spec.ts` starts its own throwaway
project the same way and publishes member events with the `admin` user, as organization-service
would: it checks that the copy of the memberships reads the events published before the service
started, applies joins, role changes and removals by version, ignores a redelivered or older event,
keeps two organizations apart under row-level security, and that the broker grants the `task` user
its three consumers by exact name only. `tests/spaces.int-spec.ts` does the same for the spaces and
lists: every route against its contract validators, the visibility and role rules, the prefixes,
`If-Match`, paging, `Idempotency-Key`, row-level security of the three tables, the events in the
outbox, and the handover of private spaces by the clean-up job of `member.removed.v1`: seen by
nobody until the job reaches them, then the owner's or awaiting one, kept by a re-join, and a
failing batch retried alone. `tests/tasks.int-spec.ts`
does the same for the tasks: every route against its contract validators, the rules of a task,
`If-Match`, `Idempotency-Key`, the activity log, row-level security of the five tables, the events in
the outbox, and the clean-up job of a removed member: enqueued with the removal, emptying
1,200 assignments in batches, enqueued once for a redelivered removal, stopped by a re-join,
retrying only the batch a lock timeout failed, run for an organization in upper case, carrying the
trace, and replayed from a dead letter with the SQL of the member-lifecycle `MODULE.md`. `tests/access.int-spec.ts` does the same for the access model:
the grants of spaces and lists and their rules, the switch of a list, the effective role on the
routes of P3a, the access requests (the existence oracle, the hourly limit, the answers), the two
access checks of the realtime gateway, row-level security of the four tables, the clean-up of the
grants and requests of a removed member, and the query plans of the access reads on a large
organization. `tests/archives.int-spec.ts` does the same for the archives: the archive and the
restoration of lists and tasks, their refusals and events, what an archived list or task leaves and
keeps, the `409 task.archived` of every change, the detachment of a restored root, the two pages
"Archives", access requests for archived targets, isolation and concurrent restorations;
`tests/archive-queries.int-spec.ts` takes the plans of the archive statements and of the live reads
on 83,000 tasks, and compares "Mes tâches" and "Accueil" with their P3a and PR 1 shapes.
`tests/trash.int-spec.ts` does the same for the trash and the deletions: every trash route and the
two `DELETE` routes against their validators, `404 task.trashed` against `task.not-found` by role,
what a task in the trash leaves, restorations (detachment, a deleted list and space brought back),
erasures, "Vider la corbeille", the jobs of a deleted list or space and of the daily purge run
through their real workers (no job left failed, no dead letter), the dropped access requests,
concurrency and row-level security of `trash_entries`; `tests/trash-queries.int-spec.ts` takes the
plans of the trash, purge and deletion statements on more than 200,000 tasks and the deploy-time
cost of `migrations/0007_trash.sql`. They move to the fixtures
of `@cadenway/nest-testing` once that package exports them.

## Minimum checks by change

The scripts below are this repository's contract. While the repository is being bootstrapped,
create them with these exact names; afterwards, use them and never an ad-hoc equivalent. Run the
narrowest check that covers the change first, then widen:

| Changed                         | Minimum check                                                |
| ------------------------------- | ------------------------------------------------------------ |
| Domain or use case code         | `pnpm test <module>`, then `pnpm test:coverage`              |
| Persistence, events, migrations | `pnpm test:integration <module>`                             |
| Routes                          | `pnpm test <module>/api` and the contract tests              |
| Any source                      | `pnpm format:check`, `pnpm lint`, `pnpm typecheck`           |
| Build or runtime configuration  | `pnpm build`, `docker compose -f compose.dev.yaml config -q` |
| Docs or agent instructions only | Scoped formatting and link review                            |

Report the commands you actually ran and their results; a check you did not run is reported as not
run.

## Full local quality gate

Run the commands below from this repository, in order, and stop at the first failure.
`pnpm quality` runs the package checks other than the integration suite and Compose validation.

```bash
pnpm format:check
pnpm test:lint
pnpm lint
pnpm typecheck
pnpm test:architecture
pnpm test:coverage
pnpm test:integration                    # PostgreSQL and NATS in Docker
pnpm build
docker compose -f compose.dev.yaml config -q
```

For a focused check, use `pnpm test "<path>"` for unit specs and
`pnpm test:integration "<path>"` for integration specs. Run both only when the path covers both
suites. Pass the path as one argument.

Report each command as passed, failed, not run or unavailable. When a test command runs,
include the executed count. Report `0 tests executed` as unverified even if the process exits
successfully. If a required dependency is unavailable, state what it prevented you from checking.

## Collaboration and release

- Trunk-based: work branches come from `main`, named `<type>/<lowercase-kebab-description>` with a
  type among `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`,
  `revert`; put the Cadenway task id first when there is one (`feat/cad-482-sso-screen`). Never an
  agent name as a prefix. Validate with `git check-ref-format --branch <name>`.
- Commits and PR titles follow Conventional Commits: `type(scope): subject`, English, imperative,
  lowercase subject, no trailing period, at most 100 characters; `!` only for a breaking change.
- Pull requests target `main` and are squash-merged after review and green CI. release-please opens the release pull request; its merge tags the version, publishes the image to GHCR, and the deploy workflow of this repository (`.github/workflows/deploy.yml`) writes the new version into cadenway-ops (staging, then production after approval).
- Stage only the files of your task; preserve other people's changes in the working tree.

Keep credentials, private keys, decrypted environment files and Terraform state out of documentation and logs. Follow the hard limits in [AGENTS.md](../AGENTS.md); setup instructions do not authorize deployments or changes to real infrastructure.
