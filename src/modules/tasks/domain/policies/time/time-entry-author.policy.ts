import { TimeEntryAuthorRequiredError } from '../../errors/time/time-entry-author-required.error.js';

/** Enforces the work-log ownership rule of `deleteTaskTimeEntryInternal`. */
export function assertTimeEntryAuthor(authorUserId: string, actorUserId: string): void {
  if (authorUserId !== actorUserId) {
    throw new TimeEntryAuthorRequiredError();
  }
}
