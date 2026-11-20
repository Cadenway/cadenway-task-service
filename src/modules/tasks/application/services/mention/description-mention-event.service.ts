import type { Task } from '../../../domain/aggregates/task/task.aggregate.js';
import { descriptionMentionChanges } from '../../../domain/policies/mention/description-mention-changes.policy.js';
import type { DescriptionMention } from '../../../domain/value-objects/mention/description-mention.value-object.js';
import type { EventActor } from '../../models/actor/event-actor.model.js';
import type { TaskEvents } from '../../ports/outbound/messaging/task/task-events.port.js';

/** Appends only account additions and removals when stored description recipients change. */
export async function appendDescriptionMentionChange(
  events: TaskEvents,
  before: readonly DescriptionMention[],
  task: Task,
  actor: EventActor,
): Promise<void> {
  const change = descriptionMentionChanges(before, task.snapshot.descriptionMentions);
  if (change.added.length > 0 || change.removed.length > 0) {
    await events.descriptionMentionsChanged(task, change, actor);
  }
}
