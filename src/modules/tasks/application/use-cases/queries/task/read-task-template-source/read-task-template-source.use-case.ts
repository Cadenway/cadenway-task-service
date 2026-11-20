import type { Task } from '../../../../../domain/aggregates/task/task.aggregate.js';
import { InvalidTaskError } from '../../../../../domain/errors/task/invalid-task.error.js';
import { TaskKey } from '../../../../../domain/value-objects/task/task-key.value-object.js';
import { MAX_DIRECT_SUBTASKS } from '../../../../../domain/value-objects/task/task-limits.value-object.js';
import type { LocateRequest } from '../../../../models/task/locate-request.model.js';
import { TaskRefusal } from '../../../../models/task/task-refusal.model.js';
import type { TaskTemplateSourceInput } from '../../../../models/task/task-template-source-input.model.js';
import type { MemberDirectory } from '../../../../ports/outbound/members/membership/member-directory.port.js';
import type { SpaceDirectory } from '../../../../ports/outbound/spaces/space/space-directory.port.js';
import type { TasksUnitOfWork } from '../../../../ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import { ViewerResolver } from '../../../../services/member/viewer-resolver.service.js';
import { TaskLocator } from '../../../../services/task/task-locator.service.js';
import type { ReadTaskTemplateSourceOutput } from './read-task-template-source.output.js';

/** Locks an editable source task and reads only the content required for a template. */
export class ReadTaskTemplateSource {
  // #region Properties
  /** Resolves the acting member in the tenant. */
  private readonly viewers: ViewerResolver;

  /** Checks task visibility, edit access and lifecycle. */
  private readonly locator: TaskLocator;
  // #endregion

  // #region Constructor
  /** Uses the task's own persistence and access policy inside the caller's transaction. */
  public constructor(
    private readonly unitOfWork: TasksUnitOfWork,
    members: MemberDirectory,
    spaces: SpaceDirectory,
  ) {
    this.viewers = new ViewerResolver(members);
    this.locator = new TaskLocator(spaces);
  }
  // #endregion

  // #region Methods
  /** Checks the space before reporting any refusal about the requested source. */
  public async execute(input: TaskTemplateSourceInput): Promise<ReadTaskTemplateSourceOutput> {
    try {
      return await this.readSource(input);
    } catch (error: unknown) {
      if (!(error instanceof TaskRefusal)) {
        throw error;
      }
      const refusal = error.refusal;
      switch (refusal.reason) {
        case 'organization-not-found':
          return { outcome: 'refused', status: 404, code: 'organization.not-found' };
        case 'task-not-found':
          return { outcome: 'refused', status: 404, code: 'task.not-found' };
        case 'role-insufficient':
          return {
            outcome: 'refused',
            status: 403,
            code: 'access.role-insufficient',
            details: { role: refusal.role, requiredRole: 'edit' },
          };
        case 'task-archived':
          return {
            outcome: 'refused',
            status: 409,
            code: 'task.archived',
            details: { key: refusal.key },
          };
        case 'task-trashed':
          return {
            outcome: 'refused',
            status: 404,
            code: 'task.trashed',
            details: {
              key: refusal.key,
              name: refusal.name,
              entryId: refusal.entryId,
              rootKey: refusal.rootKey,
              trashedAt: refusal.trashedAt.toISOString(),
              trashedBy: { type: refusal.trashedBy.type, id: refusal.trashedBy.id },
              purgeAt: refusal.purgeAt.toISOString(),
            },
          };
        default:
          throw error;
      }
    }
  }

  /** Reads the authorized, locked task and its direct live children. */
  private async readSource(input: TaskTemplateSourceInput): Promise<ReadTaskTemplateSourceOutput> {
    const { organizationId, actorUserId, spaceId, taskKey } = input;
    const key: TaskKey = this.parseKey(taskKey);
    return this.unitOfWork.run(async (store): Promise<ReadTaskTemplateSourceOutput> => {
      const request: LocateRequest = {
        organizationId,
        viewer: await this.viewers.resolve(organizationId, actorUserId, true),
        taskKey,
        lock: false,
        edit: true,
        archived: 'refuse',
        expectedVersions: null,
      };
      const observed = this.inSpace(
        await store.tasks.findByKey(organizationId, key, false),
        spaceId,
      );
      await this.locator.confirm(store, request, observed);
      const task = this.inSpace(await store.tasks.findByKey(organizationId, key, true), spaceId);
      await this.locator.confirm(store, request, task);
      const { id, listId, name, description, priority, labels, checklist } = task.snapshot;
      const children = await store.reader.childrenOf(organizationId, id, null, MAX_DIRECT_SUBTASKS);
      const source = {
        listId,
        title: name,
        description,
        priority,
        labels,
        checklist: [...checklist]
          .sort((left, right) => left.position - right.position)
          .map((item) => item.text),
        subtasks: children.map((child) => child.name),
      };
      return { outcome: 'found', source };
    });
  }

  /** A missing task and a task in another space have the same result. */
  private inSpace(task: Task | null, spaceId: string): Task {
    if (task?.snapshot.spaceId !== spaceId) {
      throw new TaskRefusal({ reason: 'task-not-found' });
    }
    return task;
  }

  /** Translates a malformed key to the same lookup result as an unknown key. */
  private parseKey(taskKey: string): TaskKey {
    try {
      return TaskKey.parse(taskKey);
    } catch (error: unknown) {
      if (error instanceof InvalidTaskError) {
        throw new TaskRefusal({ reason: 'task-not-found' });
      }
      throw error;
    }
  }
  // #endregion
}
