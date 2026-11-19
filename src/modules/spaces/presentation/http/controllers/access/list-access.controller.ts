import type { AccessCheck } from '@cadenway/contracts/types/internal/task-service';
import { InternalAccess } from '@cadenway/nest-common';
import { Controller, Get, Param } from '@nestjs/common';

import type { Caller } from '../../../../application/models/caller/caller.model.js';
import type { CheckListAccessOutput } from '../../../../application/use-cases/queries/access/check-list-access/check-list-access.output.js';
import { CheckListAccess } from '../../../../application/use-cases/queries/access/check-list-access/check-list-access.use-case.js';
import { ListAccessPath } from '../../dto/input/access/list-access-path.dto.js';
import { answerRefusals } from '../../errors/space/space-refusal.problem.js';
import { toCaller } from '../../mappers/caller/caller.mapper.js';

/**
 * Class ListAccessController
 *
 * @description
 * The access check of a list of `openapi/internal/task-service.yaml`, which the realtime gateway
 * calls before a socket joins the room of a list; it has no public route. It accepts the issuer
 * `realtime-gateway` only (`403 auth.issuer-not-allowed` for the API gateway), with the actor
 * `user`, the person of the socket, and an organization, which come from the verified internal
 * token. Its own controller, so that the issuer of the other routes of the lists never reaches it.
 * The controller validates, maps and delegates: the role and the transaction belong to the use
 * case.
 */
@Controller('internal/v1/lists/:listId/access')
@InternalAccess({ issuers: ['realtime-gateway'], actors: ['user'], organization: 'required' })
export class ListAccessController {
  // #region Properties
  /**
   * Property checkListAccess
   *
   * @description
   * Use case of the check.
   *
   * @type {CheckListAccess}
   * @readonly
   */
  private readonly checkListAccess: CheckListAccess;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Takes the use case, provided by `SpacesModule`.
   *
   * @param {CheckListAccess} checkListAccess - Use case of the check.
   * @constructor
   */
  public constructor(checkListAccess: CheckListAccess) {
    this.checkListAccess = checkListAccess;
  }
  // #endregion

  // #region Methods
  /**
   * Method check
   *
   * @description
   * `GET /internal/v1/lists/{listId}/access`: `200` with the role of the person on a list they
   * have a role on, its space and the list (`taskKey: null`); `404 list.not-found` for any other
   * list, `404 organization.not-found` for a person the copy of the memberships does not hold.
   * Read only: nothing is written and nothing is emitted.
   *
   * @param {ListAccessPath} path - The id of the list.
   * @returns {Promise<AccessCheck>} The role and where the list is.
   * @throws {ProblemException} `404 list.not-found` or `404 organization.not-found`.
   */
  @Get()
  public async check(@Param() path: ListAccessPath): Promise<AccessCheck> {
    const caller: Caller = toCaller();
    const access: CheckListAccessOutput = await answerRefusals(() =>
      this.checkListAccess.execute({ ...caller, listId: path.listId }),
    );
    return { role: access.role, spaceId: access.spaceId, listId: access.listId, taskKey: null };
  }
  // #endregion
}
