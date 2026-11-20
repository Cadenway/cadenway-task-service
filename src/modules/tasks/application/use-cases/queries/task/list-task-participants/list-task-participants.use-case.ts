import { TaskRefusal } from '../../../../models/task/task-refusal.model.js';
import type { MemberDirectory } from '../../../../ports/outbound/members/membership/member-directory.port.js';
import type { TaskParticipantDirectory } from '../../../../ports/outbound/members/membership/task-participant-directory.port.js';
import type { SpaceDirectory } from '../../../../ports/outbound/spaces/space/space-directory.port.js';
import type { TasksUnitOfWork } from '../../../../ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import { ViewerResolver } from '../../../../services/member/viewer-resolver.service.js';
import { TaskLocator } from '../../../../services/task/task-locator.service.js';
import type { ListTaskParticipantsInput } from './list-task-participants.input.js';
import type { ListTaskParticipantsOutput } from './list-task-participants.output.js';

/** Reads eligible participant identifiers for a caller with comment or edit access. */
export class ListTaskParticipants {
  // #region Properties
  /** Read-only tenant transaction. */
  private readonly unit: TasksUnitOfWork;

  /** Resolves the acting member from the membership projection. */
  private readonly viewers: ViewerResolver;

  /** Resolves the task and its placement. */
  private readonly locator: TaskLocator;

  /** Pages current members who can read the list. */
  private readonly participants: TaskParticipantDirectory;
  // #endregion

  // #region Constructor
  /** Binds the snapshot, visibility resolver and participant directory. */
  public constructor(
    unit: TasksUnitOfWork,
    members: MemberDirectory,
    spaces: SpaceDirectory,
    participants: TaskParticipantDirectory,
  ) {
    this.unit = unit;
    this.viewers = new ViewerResolver(members);
    this.locator = new TaskLocator(spaces);
    this.participants = participants;
  }
  // #endregion

  // #region Methods
  /** Checks the task and caller's permission before reading the audience in the same snapshot. */
  public async execute(input: ListTaskParticipantsInput): Promise<ListTaskParticipantsOutput> {
    return this.unit.runReadOnly(
      async (store): Promise<ListTaskParticipantsOutput> => {
        const viewer = await this.viewers.resolve(input.organizationId, input.actorUserId);
        const { placement } = await this.locator.locate(store, {
          organizationId: input.organizationId,
          viewer,
          taskKey: input.taskKey,
          edit: false,
          lock: false,
          archived: 'allow',
          expectedVersions: null,
        });
        const { callerRole, id } = placement.list;
        if (callerRole === 'view') {
          throw new TaskRefusal({
            reason: 'role-insufficient',
            role: callerRole,
            requiredRole: 'comment',
          });
        }
        const page = await this.participants.list(
          input.organizationId,
          id,
          input.after,
          input.limit + 1,
        );
        const items = page.slice(0, input.limit);
        return { items, next: page.length > input.limit ? (items.at(-1)?.userId ?? null) : null };
      },
      { snapshot: true },
    );
  }
  // #endregion
}
