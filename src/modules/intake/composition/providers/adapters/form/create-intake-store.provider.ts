import type { TransactionScope } from '@cadenway/nest-common/database';
import type { OutboxWriter } from '@cadenway/nest-messaging/outbox';
import { getOrganizationContext } from '@cadenway/nest-common';
import { randomBytes } from 'node:crypto';

import type { FindOrganizationMember } from '../../../../../organization-members/public/membership/find-organization-member.js';
import type { ResolveIntakePlacement } from '../../../../../spaces/public/intake/resolve-intake-placement.js';
import type {
  ResolveIntakePlacementInput,
  ResolveIntakePlacementOutput,
} from '../../../../../spaces/public/intake/resolve-intake-placement.js';
import { CreateIntakeTask } from '../../../../../tasks/public/intake/create-intake-task.js';
import type { ResolveIntakeContactTask } from '../../../../../tasks/public/intake/resolve-intake-contact-task.js';
import { IntakeAccessError } from '../../../../application/models/form/intake-access-error.model.js';
import { IntakeResourceError } from '../../../../application/models/form/intake-resource-error.model.js';
import type { IntakeStore } from '../../../../application/models/form/intake-store.model.js';
import type { IntakeAttachmentStore } from '../../../../application/ports/outbound/persistence/attachment/intake-attachment-store.port.js';
import { IntakeFormError } from '../../../../domain/errors/form/intake-form.error.js';
import { OutboxIntakeAttachmentDecisions } from '../../../../infrastructure/messaging/outbox/attachment/outbox-intake-attachment-decisions.adapter.js';
import { DrizzleIntakeAttachments } from '../../../../infrastructure/persistence/drizzle/repositories/attachment/drizzle-intake-attachments.repository.js';
import { DrizzleIntakeRepository } from '../../../../infrastructure/persistence/drizzle/repositories/form/drizzle-intake.repository.js';

interface IntakeDirectories {
  // #region Properties
  /** The module operations sharing this transaction. */
  readonly members: Pick<FindOrganizationMember, 'execute'>;
  readonly placement: Pick<ResolveIntakePlacement, 'execute'>;
  readonly tasks: Pick<CreateIntakeTask, 'execute'>;
  readonly contactTask: Pick<ResolveIntakeContactTask, 'execute'>;
  // #endregion
}

type IntakeViewer = NonNullable<ResolveIntakePlacementInput['viewer']>;

/** Keeps editor and contact work bound to the actor from the verified request. */
function requireIntakeActor(actorUserId: string): void {
  const actor = getOrganizationContext()?.actor;
  if (actor?.type !== 'user' || actor.id?.toLowerCase() !== actorUserId.toLowerCase()) {
    throw new Error('Intake requires the verified user.');
  }
}

/** Projects the statuses offered by the owning space for the form's default check. */
function allowedStatuses(statuses: ResolveIntakePlacementOutput['statuses']): ReadonlySet<string> {
  return new Set(Object.entries(statuses).flatMap(([key, status]) => (status.hidden ? [] : [key])));
}

/** Binds the storage and public module operations to the same tenant database transaction. */
export function createIntakeStore(
  scope: TransactionScope,
  organizationId: string,
  { members, placement, tasks, contactTask }: IntakeDirectories,
  outbox: OutboxWriter,
): IntakeStore {
  const forms = new DrizzleIntakeRepository(scope.db, organizationId);
  const reservations = new DrizzleIntakeAttachments(scope.db, organizationId);
  const decisions = new OutboxIntakeAttachmentDecisions(scope, outbox);

  async function editorMembership(userId: string, lock: boolean): Promise<IntakeViewer> {
    const actor = await members.execute({ organizationId, userId, lock });
    if (actor === null) throw new IntakeResourceError({ kind: 'organization-not-found' });
    return { userId, role: actor.role };
  }

  async function editorPlacement(
    listId: string,
    viewer: IntakeViewer,
    lock: boolean,
  ): Promise<ResolveIntakePlacementOutput> {
    const target = await placement.execute({ organizationId, listId, viewer, lock });
    if (!target?.role) {
      throw new IntakeFormError({ kind: 'list-not-found' });
    }
    if (target.role !== 'edit') throw new IntakeAccessError(target.role);
    return target;
  }

  async function assigneeMemberships(
    assigneeIds: readonly (string | null | undefined)[],
    lock: boolean,
  ): Promise<ReadonlyMap<string, IntakeViewer>> {
    const candidates = new Map<string, IntakeViewer>();
    const ids = [...new Set(assigneeIds.filter((id) => typeof id === 'string'))].sort();
    for (const id of ids) {
      const userId = id.toLowerCase();
      const membership = await members.execute({ organizationId, userId, lock });
      if (membership !== null && CreateIntakeTask.allowsAssigneeRole(membership.role)) {
        candidates.set(id, { userId, role: membership.role });
      }
    }
    return candidates;
  }

  async function eligibleAssignees(
    listId: string,
    candidates: ReadonlyMap<string, IntakeViewer>,
  ): Promise<ReadonlySet<string>> {
    // The caller already holds the membership and placement on a write. Reading the grant
    // through Spaces preserves the usual list rules without taking locks in reverse order.
    const eligible = new Set<string>();
    for (const [id, viewer] of candidates) {
      const visible = await placement.execute({ organizationId, listId, viewer, lock: false });
      if (visible !== null) eligible.add(id);
    }
    return eligible;
  }

  const createTask: IntakeAttachmentStore['createTask'] = async (
    listId,
    { task, contactEmail },
  ) => {
    const { taskId, taskKey } = await tasks
      .execute({
        organizationId,
        listId,
        name: task.title,
        description: task.description,
        status: task.status,
        priority: task.priority,
        dueDate: task.dueDate,
        assigneeId: task.assigneeId?.toLowerCase() ?? null,
      })
      .catch((error: unknown) => {
        const kind = CreateIntakeTask.refusalOf(error);
        if (kind === undefined) throw error;
        throw new IntakeFormError({ kind });
      });
    if (contactEmail !== null) await forms.saveContact(taskId, contactEmail);
    return { receipt: randomBytes(32).toString('base64url'), taskKey };
  };

  return {
    attachments: {
      loadDraft: reservations.loadDraft.bind(reservations),
      startDraft: reservations.startDraft.bind(reservations),
      findReservationClaim: reservations.findReservationClaim.bind(reservations),
      newAttachmentId: reservations.newAttachmentId.bind(reservations),
      listReservations: reservations.listReservations.bind(reservations),
      insertReservation: reservations.insertReservation.bind(reservations),
      findReservation: reservations.findReservation.bind(reservations),
      findByIdentity: reservations.findByIdentity.bind(reservations),
      saveReservation: reservations.saveReservation.bind(reservations),
      saveDraft: reservations.saveDraft.bind(reservations),
      async recordDecision(reservation) {
        const decision = reservation.decision;
        if (decision === undefined) {
          throw new Error('An intake attachment terminal transition is required.');
        }
        await reservations.saveReservation(reservation);
        await decisions.append(decision);
      },
      createTask,
    },
    async loadEditor({ organizationId: requested, actorUserId, listId }, lock, proposedAssigneeId) {
      if (requested.toLowerCase() !== organizationId) {
        throw new Error('Intake editor scope does not match the transaction.');
      }
      requireIntakeActor(actorUserId);
      const userId = actorUserId.toLowerCase();
      const previewActor = await editorMembership(userId, false);
      const previewPlacement = await editorPlacement(listId, previewActor, false);

      // Refused editors never wait on settings. Recheck the membership and role after obtaining
      // the settings lock and before the form can be used for a write.
      if (lock) await forms.holdSettings(listId, 'exclusive');
      const actor = lock ? await editorMembership(userId, true) : previewActor;
      const preview = await forms.findForm(listId, false);
      const assignees = await assigneeMemberships(
        [preview?.snapshot().defaultAssigneeId, proposedAssigneeId],
        lock,
      );
      const target = lock ? await editorPlacement(listId, actor, true) : previewPlacement;

      return {
        access: { role: 'edit', lifecycle: target.archived ? 'archived' : 'active' },
        form: lock ? await forms.findForm(listId, true) : preview,
        eligibility: {
          allowedStatuses: allowedStatuses(target.statuses),
          eligibleAssignees: await eligibleAssignees(listId, assignees),
        },
      };
    },

    saveForm: forms.saveForm.bind(forms),
    reservePublicationKey: forms.reservePublicationKey.bind(forms),

    async loadPublication(listId, key, lock) {
      if (lock) await forms.holdSettings(listId, 'shared');
      const preview = await forms.findPublishedForm(listId, key, false);
      if (preview === null) return null;

      const assignees = await assigneeMemberships([preview.snapshot().defaultAssigneeId], lock);
      const target = await placement.execute({ organizationId, listId, lock });
      if (target === null) return null;

      const form = lock ? await forms.findPublishedForm(listId, key, true) : preview;
      if (form === null) return null;
      return {
        form,
        context: {
          key,
          lifecycle: target.archived ? 'archived' : 'active',
          eligibility: {
            allowedStatuses: allowedStatuses(target.statuses),
            eligibleAssignees: await eligibleAssignees(listId, assignees),
          },
        },
      };
    },

    claimSubmission: forms.claimSubmission.bind(forms),
    completeSubmission: forms.completeSubmission.bind(forms),

    async createTask(listId, submission) {
      return (await createTask(listId, submission)).receipt;
    },

    async readContact(actorUserId, taskKey) {
      requireIntakeActor(actorUserId);
      const task = await contactTask.execute({ organizationId, actorUserId, taskKey });
      switch (task.outcome) {
        case 'found':
          return forms.findContact(task.taskId);
        case 'role-insufficient':
          throw new IntakeAccessError(task.role);
        case 'task-trashed':
          throw new IntakeResourceError({ kind: task.outcome, details: task.details });
        case 'task-not-found':
        case 'organization-not-found':
          throw new IntakeResourceError({ kind: task.outcome });
      }
    },
  };
}
