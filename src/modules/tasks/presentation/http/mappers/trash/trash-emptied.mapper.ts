import type { TrashEmptied } from '@cadenway/contracts/types/internal/task-service';

import type { EmptyTrashOutput } from '../../../../application/use-cases/commands/trash/empty-trash/empty-trash.output.js';

/**
 * Function toTrashEmptied
 *
 * @description
 * Maps what "Vider la corbeille" took out to `TrashEmptied` of the contract.
 *
 * @param {EmptyTrashOutput} output - The count of the entries handed to the purge.
 * @returns {TrashEmptied} The body.
 */
export function toTrashEmptied(output: EmptyTrashOutput): TrashEmptied {
  return { entryCount: output.entryCount };
}
