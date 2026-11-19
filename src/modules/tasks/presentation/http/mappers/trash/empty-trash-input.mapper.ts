import type { Caller } from '../../../../application/models/caller/caller.model.js';
import type { EmptyTrashInput } from '../../../../application/use-cases/commands/trash/empty-trash/empty-trash.input.js';
import type { EmptyTrashBody } from '../../dto/input/trash/empty-trash-body.dto.js';

/**
 * Function toEmptyTrashInput
 *
 * @description
 * The input of "Vider la corbeille": the actor and the organization of the verified token. The
 * body is the empty object of the contract (`EmptyRequest`), validated by the route and carrying
 * no member (the generated validator drops any), so nothing of it reaches the use case.
 *
 * @param {EmptyTrashBody} _body - The validated body, not read.
 * @param {Caller} caller - The actor and the organization.
 * @returns {EmptyTrashInput} The input of the use case.
 */
export function toEmptyTrashInput(_body: EmptyTrashBody, caller: Caller): EmptyTrashInput {
  return { organizationId: caller.organizationId, actorUserId: caller.actorUserId };
}
