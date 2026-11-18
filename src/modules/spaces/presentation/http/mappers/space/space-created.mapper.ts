import type { SpaceCreated } from '@cadenway/contracts/types/internal/task-service';

import type { CreateSpaceOutput } from '../../../../application/use-cases/commands/space/create-space/create-space.output.js';
import { toTaskList } from '../list/task-list.mapper.js';
import { toSpace } from './space.mapper.js';

/**
 * Function toSpaceCreated
 *
 * @description
 * Maps the new space and its first list "Première liste" to the `SpaceCreated` of the contract.
 *
 * @param {CreateSpaceOutput} created - The space and its first list.
 * @returns {SpaceCreated} The body of the `201`.
 */
export function toSpaceCreated(created: CreateSpaceOutput): SpaceCreated {
  return { space: toSpace(created.space), firstList: toTaskList(created.firstList) };
}
