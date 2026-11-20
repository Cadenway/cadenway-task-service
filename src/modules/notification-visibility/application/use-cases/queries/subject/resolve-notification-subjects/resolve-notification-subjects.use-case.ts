import type { NotificationSubject } from '../../../../models/subject/notification-subject.model.js';
import type { NotificationSubjectDecision } from '../../../../models/subject/notification-subject-decision.model.js';
import type { NotificationSubjectLookupInput } from '../../../../models/subject/notification-subject-lookup-input.model.js';
import type { NotificationSubjectDirectory } from '../../../../ports/outbound/resources/subject/notification-subject-directory.port.js';

/** Resolves current visibility through the owning modules in one tenant snapshot. */
export class ResolveNotificationSubjects {
  // #region Constructor
  /** The snapshot wraps membership, resources and optional live comment reads. */
  public constructor(
    private readonly inSnapshot: <T>(work: () => Promise<T>) => Promise<T>,
    private readonly directory: NotificationSubjectDirectory,
  ) {}
  // #endregion

  // #region Methods
  /** Returns null if the viewer has no active membership. */
  public execute(
    input: NotificationSubjectLookupInput,
  ): Promise<readonly NotificationSubjectDecision[] | null> {
    if (input.subjects.length < 1 || input.subjects.length > 100) {
      throw new RangeError('A notification visibility lookup accepts one to 100 subjects.');
    }
    return this.inSnapshot(async () => {
      const { organizationId, userId, subjects } = input;
      const member = await this.directory.findMember({ organizationId, userId });
      if (member === null) return null;

      const references = (kind: NotificationSubject['kind']): string[] =>
        subjects.filter((entry) => entry.kind === kind).map((entry) => entry.reference);
      const viewer = { userId, role: member.role };
      const listIds = references('list');
      const spaceIds = references('space');
      const { tasks } = await this.directory.findTasks({
        organizationId,
        viewer,
        taskIds: references('task-id'),
        taskKeys: references('task-key'),
      });
      const placement = { organizationId, viewerUserId: userId, viewerRole: member.role };
      const visibleLists =
        listIds.length === 0
          ? []
          : (await this.directory.findLists({ ...placement, listIds })).lists;
      const visibleSpaces =
        spaceIds.length === 0 ? [] : await this.directory.findSpaces({ ...placement, spaceIds });
      const lists = new Set(visibleLists.map((list) => list.id));
      const spaces = new Set(visibleSpaces.map((space) => space.id));
      const tasksById = new Map(tasks.map((task) => [task.id, task]));
      const tasksByKey = new Map(tasks.map((task) => [task.key, task]));
      const findTask = (subject: NotificationSubject): (typeof tasks)[number] | undefined => {
        switch (subject.kind) {
          case 'task-id':
            return tasksById.get(subject.reference.toLowerCase());
          case 'task-key':
            return tasksByKey.get(subject.reference);
          default:
            return undefined;
        }
      };

      const pairs = subjects.flatMap((subject) => {
        const task = findTask(subject);
        const commentId = subject.display?.commentId;
        return task === undefined || commentId === undefined
          ? []
          : [{ taskId: task.id, commentId }];
      });
      const excerpts =
        pairs.length === 0 ? [] : await this.directory.findComments({ organizationId, pairs });
      const byPair = new Map(
        excerpts.map((item) => [`${item.taskId}:${item.commentId}`, item.excerpt]),
      );

      return subjects.map((subject): NotificationSubjectDecision => {
        if (subject.kind === 'list') return { visible: lists.has(subject.reference.toLowerCase()) };
        if (subject.kind === 'space')
          return { visible: spaces.has(subject.reference.toLowerCase()) };
        const task = findTask(subject);
        if (task === undefined) return { visible: false };
        if (subject.display === undefined) return { visible: true };

        const display = { taskId: task.id, taskKey: task.key, taskName: task.name };
        const commentId = subject.display.commentId;
        return {
          visible: true,
          display:
            commentId === undefined
              ? display
              : {
                  ...display,
                  commentExcerpt: byPair.get(`${task.id}:${commentId.toLowerCase()}`) ?? null,
                },
        };
      });
    });
  }
  // #endregion
}
