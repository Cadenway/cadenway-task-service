import type { StatusKey } from '@cadenway/contracts';
import { STATUS_KEYS } from '@cadenway/contracts';

import type { UpdateSpaceInput } from '../../../../application/use-cases/commands/space/update-space/update-space.input.js';
import type { UpdateSpaceBody } from '../../dto/input/space/update-space-body.dto.js';

/**
 * Type StatusesPatch
 *
 * @description
 * The change of the statuses of a space, by key.
 *
 * @type {NonNullable<UpdateSpaceInput['patch']['statuses']>}
 */
type StatusesPatch = NonNullable<UpdateSpaceInput['patch']['statuses']>;

/**
 * Type StatusPatch
 *
 * @description
 * The change of one status, `name` and `hidden` as far as the patch names them.
 *
 * @type {NonNullable<StatusesPatch[StatusKey]>}
 */
type StatusPatch = NonNullable<StatusesPatch[StatusKey]>;

/**
 * Function toStatusPatch
 *
 * @description
 * Keeps the members of one status the patch names: a member left out stays absent, which is not
 * `null`.
 *
 * @param {NonNullable<NonNullable<UpdateSpaceBody['statuses']>[StatusKey]>} status - The change as sent.
 * @returns {StatusPatch} The change for the use case.
 */
function toStatusPatch(
  status: NonNullable<NonNullable<UpdateSpaceBody['statuses']>[StatusKey]>,
): StatusPatch {
  return {
    ...(status.name === undefined ? {} : { name: status.name }),
    ...(status.hidden === undefined ? {} : { hidden: status.hidden }),
  };
}

/**
 * Function toStatusesPatch
 *
 * @description
 * Keeps the statuses the patch names: a key left out is unchanged, `null` for a key puts back its
 * default label and uses it again.
 *
 * @param {NonNullable<UpdateSpaceBody['statuses']>} statuses - The change as sent.
 * @returns {StatusesPatch} The change for the use case.
 */
function toStatusesPatch(statuses: NonNullable<UpdateSpaceBody['statuses']>): StatusesPatch {
  const patch: Partial<Record<StatusKey, StatusPatch | null>> = {};
  for (const key of STATUS_KEYS) {
    const status = statuses[key];
    if (status === undefined) {
      continue;
    }
    patch[key] = status === null ? null : toStatusPatch(status);
  }
  return patch;
}

/**
 * Function toSpacePatch
 *
 * @description
 * Maps the JSON Merge Patch of a space to the patch of the use case, keeping a member left out
 * (absent) distinct from a member sent as `null`: only `description`, `icon` and `statuses` accept
 * `null`, and the schema of the contract refuses it for the others.
 *
 * @param {UpdateSpaceBody} body - The patch as sent.
 * @returns {UpdateSpaceInput['patch']} The patch for the use case.
 */
export function toSpacePatch(body: UpdateSpaceBody): UpdateSpaceInput['patch'] {
  return {
    ...(body.name === undefined ? {} : { name: body.name }),
    ...(body.prefix === undefined ? {} : { prefix: body.prefix }),
    ...(body.description === undefined ? {} : { description: body.description }),
    ...(body.icon === undefined ? {} : { icon: body.icon }),
    ...(body.color === undefined ? {} : { color: body.color }),
    ...(body.visibility === undefined ? {} : { visibility: body.visibility }),
    ...(body.statuses === undefined
      ? {}
      : { statuses: body.statuses === null ? null : toStatusesPatch(body.statuses) }),
  };
}
