import { Task } from './aggregates/task/task.aggregate.js';
import type { ActivityEntryState } from './value-objects/activity/activity-entry-state.value-object.js';
import type { AssigneeCandidate } from './value-objects/member/assignee-candidate.value-object.js';
import type { MemberRole } from './value-objects/member/member-role.value-object.js';
import type { SubtaskParent } from './value-objects/subtask/subtask-parent.value-object.js';
import type { NewTask } from './value-objects/task/new-task.value-object.js';
import type { SpaceStatusUse } from './value-objects/task/space-status-use.value-object.js';
import type { StatusKey } from './value-objects/task/status-key.value-object.js';
import { STATUS_KEYS } from './value-objects/task/status-key.value-object.js';
import type { TaskActor } from './value-objects/task/task-actor.value-object.js';
import type { TaskArchive } from './value-objects/task/task-archive.value-object.js';
import { TaskKey } from './value-objects/task/task-key.value-object.js';
import type { TaskPlacement } from './value-objects/task/task-placement.value-object.js';
import type { TaskState } from './value-objects/task/task-state.value-object.js';
import type { TaskTrash } from './value-objects/task/task-trash.value-object.js';

/** Organization "Atelier Nord". */
export const ATELIER_NORD = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b2f';

/** Account of Camille Martin (CM), the owner of Atelier Nord. */
export const CAMILLE = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b30';

/** Account of Inès Robert (IR), an admin of Atelier Nord. */
export const INES = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b31';

/** Account of Hugo Dubois (HD), a member of Atelier Nord. */
export const HUGO = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b32';

/** Account of Léa Petit (LP), a member of Atelier Nord. */
export const LEA = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b33';

/** Account of Nadia Benali (NB), a guest of Atelier Nord. */
export const NADIA = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b34';

/** An account the copy of the memberships does not hold. */
export const STRANGER = '019a6f00-1b2c-7d3e-8f4a-5b6c7d8e9f40';

/** The space "Produit" (CAD). */
export const PRODUIT = '019a7000-0000-7000-8000-000000000001';

/** The private space "Design" (DES), owned by Hugo Dubois. */
export const DESIGN = '019a7000-0000-7000-8000-000000000002';

/** The sprint "Sprint 14" of the space "Produit". */
export const SPRINT_14 = '019a7100-0000-7000-8000-000000000002';

/** The list "Bugs" of the space "Produit". */
export const BUGS = '019a7100-0000-7000-8000-000000000003';

/** The list "Maquettes" of the space "Design". */
export const MAQUETTES = '019a7100-0000-7000-8000-000000000004';

/** The task CAD-482 "Refondre l’écran de connexion SSO". */
export const CAD_482 = '019a7200-0000-7000-8000-000000000482';

/** The subtask CAD-483 "Ajouter le bouton SSO" of CAD-482. */
export const CAD_483 = '019a7200-0000-7000-8000-000000000483';

/** The sub-subtask CAD-484 "Libellé du bouton" of CAD-483. */
export const CAD_484 = '019a7200-0000-7000-8000-000000000484';

/** The task CAD-490 "Page des quotas d’organisation", top-level in Sprint 14. */
export const CAD_490 = '019a7200-0000-7000-8000-000000000490';

/** The checklist item "Maquette validée" of CAD-482, ticked. */
export const MAQUETTE_VALIDEE = '019a7300-0000-7000-8000-000000000001';

/** The checklist item "Recette en préproduction" of CAD-482, not ticked. */
export const RECETTE = '019a7300-0000-7000-8000-000000000002';

/** When CAD-482 was created. */
export const CREATED_AT: Date = new Date('2026-11-02T09:00:00.000Z');

/** When it last changed. */
export const UPDATED_AT: Date = new Date('2026-11-07T16:30:00.000Z');

/** The transaction instant of the changes of the specs. */
export const NOW: Date = new Date('2026-11-08T10:20:00.000Z');

/** Camille Martin as the actor of a change. */
export const CAMILLE_ACTOR: TaskActor = { type: 'user', id: CAMILLE };

/** Inès Robert as the actor of a change. */
export const INES_ACTOR: TaskActor = { type: 'user', id: INES };

/** Hugo Dubois as the actor of a change. */
export const HUGO_ACTOR: TaskActor = { type: 'user', id: HUGO };

/** When Hugo Dubois made the archives of the specs ("archivée le 5 nov."). */
export const ARCHIVED_AT: Date = new Date('2026-11-05T11:30:00.000Z');

/** The trash entry CAD-482 and its subtasks make once Camille Martin deletes them. */
export const CAD_482_ENTRY = '019a7006-7a8b-7c9d-8e0f-1a2b3c4d5e03';

/** When CAD-482 went to the trash, "Supprimée il y a 2 jours" on 2026-11-08. */
export const TRASHED_AT: Date = new Date('2026-11-06T16:20:00.000Z');

/**
 * Builds the trash of a task.
 *
 * @param entryId - The entry; the entry of CAD-482 when left out.
 * @returns The trash.
 */
export function trashIn(entryId: string = CAD_482_ENTRY): TaskTrash {
  return { entryId };
}

/**
 * Builds an archive of the specs: made by Hugo Dubois on 2026-11-05, from a root.
 *
 * @param rootId - The root of the archive.
 * @param overrides - Fields to replace.
 * @returns The archive.
 */
export function archiveFrom(rootId: string, overrides: Partial<TaskArchive> = {}): TaskArchive {
  return { at: ARCHIVED_AT, by: HUGO_ACTOR, rootId, ...overrides };
}

/** Sprint 14, in the space "Produit". */
export const SPRINT_14_PLACEMENT: TaskPlacement = { listId: SPRINT_14, spaceId: PRODUIT };

/** The list "Bugs", in the space "Produit". */
export const BUGS_PLACEMENT: TaskPlacement = { listId: BUGS, spaceId: PRODUIT };

/** The list "Maquettes", in the private space "Design". */
export const MAQUETTES_PLACEMENT: TaskPlacement = { listId: MAQUETTES, spaceId: DESIGN };

/**
 * Builds the statuses of a space, every status used but those given.
 *
 * @param hidden - The statuses the space no longer uses.
 * @returns The statuses.
 */
export function statusesHiding(...hidden: readonly StatusKey[]): SpaceStatusUse {
  return Object.fromEntries(
    STATUS_KEYS.map((key: StatusKey): [StatusKey, { hidden: boolean }] => [
      key,
      { hidden: hidden.includes(key) },
    ]),
  ) as Record<StatusKey, { hidden: boolean }>;
}

/** The statuses of a space that uses all ten. */
export const ALL_STATUSES: SpaceStatusUse = statusesHiding();

/**
 * Builds a candidate assignee with its role in the copy.
 *
 * @param userId - The account.
 * @param role - Its role, or `null` when it is not a member.
 * @returns The candidate.
 */
export function candidate(userId: string, role: MemberRole | null = 'member'): AssigneeCandidate {
  return { userId, role };
}

/**
 * Builds the stored state of CAD-482 in Sprint 14: in progress, high priority, assigned to Camille
 * Martin and Inès Robert, due 2026-11-12 from 2026-11-11, 8 h, labels Auth and Front, two checklist
 * items, version 12.
 *
 * @param overrides - Fields to replace.
 * @returns The state.
 */
export function taskState(overrides: Partial<TaskState> = {}): TaskState {
  return {
    id: CAD_482,
    organizationId: ATELIER_NORD,
    key: TaskKey.of('CAD', 482),
    spaceId: PRODUIT,
    listId: SPRINT_14,
    parentId: null,
    parentKey: null,
    name: 'Refondre l’écran de connexion SSO',
    description: 'Remplacer l’écran actuel par la connexion d’entreprise.',
    status: 'progress',
    cancelReason: null,
    cancelNote: null,
    priority: 'haute',
    assigneeIds: [CAMILLE, INES],
    labels: ['Auth', 'Front'],
    dueDate: '2026-11-12',
    startDate: '2026-11-11',
    estimateMinutes: 480,
    completedAt: null,
    createdBy: CAMILLE_ACTOR,
    checklist: [
      { id: MAQUETTE_VALIDEE, text: 'Maquette validée', done: true, position: 0 },
      { id: RECETTE, text: 'Recette en préproduction', done: false, position: 1 },
    ],
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
    version: 12,
    archive: null,
    trash: null,
    ...overrides,
  };
}

/**
 * Restores CAD-482, or another state.
 *
 * @param overrides - Fields to replace.
 * @returns The task.
 */
export function cad482(overrides: Partial<TaskState> = {}): Task {
  return Task.restore(taskState(overrides));
}

/**
 * Builds the stored state of CAD-483 "Ajouter le bouton SSO", a subtask of CAD-482.
 *
 * @param overrides - Fields to replace.
 * @returns The state.
 */
export function subtaskState(overrides: Partial<TaskState> = {}): TaskState {
  return taskState({
    id: CAD_483,
    key: TaskKey.of('CAD', 483),
    parentId: CAD_482,
    parentKey: TaskKey.of('CAD', 482),
    name: 'Ajouter le bouton SSO',
    description: null,
    status: 'todo',
    priority: 'moyenne',
    assigneeIds: [CAMILLE],
    labels: [],
    dueDate: null,
    startDate: null,
    estimateMinutes: null,
    checklist: [],
    version: 1,
    ...overrides,
  });
}

/**
 * Builds the stored state of CAD-490 "Page des quotas d’organisation", top-level in Sprint 14.
 *
 * @param overrides - Fields to replace.
 * @returns The state.
 */
export function cad490State(overrides: Partial<TaskState> = {}): TaskState {
  return subtaskState({
    id: CAD_490,
    key: TaskKey.of('CAD', 490),
    parentId: null,
    parentKey: null,
    name: 'Page des quotas d’organisation',
    ...overrides,
  });
}

/**
 * Builds CAD-482 as the parent of a subtask.
 *
 * @param overrides - Fields to replace.
 * @returns The parent, at level 1 with 2 direct subtasks unless replaced.
 */
export function cad482Parent(overrides: Partial<SubtaskParent> = {}): SubtaskParent {
  return { ...cad482().asParent(1, 2), ...overrides };
}

/**
 * Builds the creation of CAD-495 "Configurer le domaine vérifié" in Sprint 14, with its defaults
 * and Camille Martin as assignee.
 *
 * @param overrides - Fields to replace.
 * @returns The new task.
 */
export function newTask(overrides: Partial<NewTask> = {}): NewTask {
  return {
    organizationId: ATELIER_NORD,
    placement: SPRINT_14_PLACEMENT,
    parent: null,
    name: 'Configurer le domaine vérifié',
    description: null,
    status: 'todo',
    cancelReason: null,
    cancelNote: null,
    priority: 'moyenne',
    assignees: [candidate(CAMILLE, 'owner')],
    dueDate: null,
    startDate: null,
    estimateMinutes: null,
    labels: [],
    createdBy: CAMILLE_ACTOR,
    ...overrides,
  };
}

/**
 * Builds a stored activity entry of CAD-482 in Sprint 14 by Camille Martin: the priority moved
 * from `moyenne` to `haute` at 10:19:30.
 *
 * @param overrides - Fields to replace.
 * @returns The entry.
 */
export function priorityEntry(overrides: Partial<ActivityEntryState> = {}): ActivityEntryState {
  return {
    id: '019a7400-0000-7000-8000-000000000001',
    organizationId: ATELIER_NORD,
    taskId: CAD_482,
    listId: SPRINT_14,
    actor: CAMILLE_ACTOR,
    occurredAt: new Date('2026-11-08T10:19:30.000Z'),
    change: { kind: 'priority', priority: { from: 'moyenne', to: 'haute' } },
    ...overrides,
  };
}
