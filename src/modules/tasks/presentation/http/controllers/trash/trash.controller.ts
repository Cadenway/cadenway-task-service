import type {
  TrashEmptied,
  TrashEntryPage as TrashEntryPageBody,
  TrashRestored,
} from '@cadenway/contracts/types/internal/task-service';
import { InternalAccess } from '@cadenway/nest-common';
import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';

import type { Caller } from '../../../../application/models/caller/caller.model.js';
import type { EmptyTrashOutput } from '../../../../application/use-cases/commands/trash/empty-trash/empty-trash.output.js';
import { EmptyTrash } from '../../../../application/use-cases/commands/trash/empty-trash/empty-trash.use-case.js';
import { PurgeTrashEntry } from '../../../../application/use-cases/commands/trash/purge-trash-entry/purge-trash-entry.use-case.js';
import type { RestoreTrashEntryOutput } from '../../../../application/use-cases/commands/trash/restore-trash-entry/restore-trash-entry.output.js';
import { RestoreTrashEntry } from '../../../../application/use-cases/commands/trash/restore-trash-entry/restore-trash-entry.use-case.js';
import type { ListTrashEntriesOutput } from '../../../../application/use-cases/queries/trash/list-trash-entries/list-trash-entries.output.js';
import { ListTrashEntries } from '../../../../application/use-cases/queries/trash/list-trash-entries/list-trash-entries.use-case.js';
import { EmptyTrashBody } from '../../dto/input/trash/empty-trash-body.dto.js';
import { RestoreTrashEntryBody } from '../../dto/input/trash/restore-trash-entry-body.dto.js';
import { TrashEntriesQuery } from '../../dto/input/trash/trash-entries-query.dto.js';
import { TrashEntryPath } from '../../dto/input/trash/trash-entry-path.dto.js';
import { answerRefusals } from '../../errors/task/task-refusal.problem.js';
import { toCaller } from '../../mappers/caller/caller.mapper.js';
import { toEmptyTrashInput } from '../../mappers/trash/empty-trash-input.mapper.js';
import { toTrashPosition } from '../../mappers/trash/trash-cursor.mapper.js';
import { toTrashEmptied } from '../../mappers/trash/trash-emptied.mapper.js';
import { toTrashEntryPage } from '../../mappers/trash/trash-entry-page.mapper.js';
import { toTrashRestored } from '../../mappers/trash/trash-restored.mapper.js';

/**
 * Class TrashController
 *
 * @description
 * The trash ("Corbeille", the tag `trash` of `openapi/internal/task-service.yaml`):
 * `listTrashInternal` (`200`, `TrashEntryPage`, `cursor` and `limit` like the other pages, `total`
 * on every page), `purgeTrashEntryInternal` (`204`), `restoreTrashEntryInternal` (`200`,
 * `TrashRestored`) and `emptyTrashInternal` (`202`, `TrashEmptied`). The bodies are the empty
 * object of the contract, validated and not read; `entryId` is a UUID (`400 request.invalid`
 * otherwise). An entry the actor may not restore answers `404 trash-entry.not-found`. Issuer
 * `api-gateway`, actor `user`, organization required. No `ETag`. While the switch of the writes
 * of the trash is off, `emptyTrashInternal` answers as a route the service does not have
 * (`404 http.not-found`); the page, the restoration and the erasure are always served.
 */
@Controller('internal/v1/trash')
@InternalAccess({ issuers: ['api-gateway'], actors: ['user'], organization: 'required' })
export class TrashController {
  // #region Properties
  /** The page of the trash. */
  private readonly listTrashEntries: ListTrashEntries;

  /** The erasure of an entry. */
  private readonly purgeTrashEntry: PurgeTrashEntry;

  /** The restoration of an entry. */
  private readonly restoreTrashEntry: RestoreTrashEntry;

  /** "Vider la corbeille". */
  private readonly emptyTrash: EmptyTrash;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Takes the four use cases of the trash.
   *
   * @param {ListTrashEntries} listTrashEntries - The page of the trash.
   * @param {PurgeTrashEntry} purgeTrashEntry - The erasure of an entry.
   * @param {RestoreTrashEntry} restoreTrashEntry - The restoration of an entry.
   * @param {EmptyTrash} emptyTrash - "Vider la corbeille".
   * @constructor
   */
  public constructor(
    listTrashEntries: ListTrashEntries,
    purgeTrashEntry: PurgeTrashEntry,
    restoreTrashEntry: RestoreTrashEntry,
    emptyTrash: EmptyTrash,
  ) {
    this.listTrashEntries = listTrashEntries;
    this.purgeTrashEntry = purgeTrashEntry;
    this.restoreTrashEntry = restoreTrashEntry;
    this.emptyTrash = emptyTrash;
  }
  // #endregion

  // #region Methods
  /**
   * Method entries
   *
   * @description
   * `GET /internal/v1/trash/entries`: one page of the trash of the actor.
   *
   * @param {TrashEntriesQuery} query - `cursor` and `limit`.
   * @returns {Promise<TrashEntryPageBody>} The page.
   * @throws {ProblemException} `400 request.invalid` for a cursor of another collection,
   * `404 organization.not-found`.
   */
  @Get('entries')
  public async entries(@Query() query: TrashEntriesQuery): Promise<TrashEntryPageBody> {
    const caller: Caller = toCaller();
    const page: ListTrashEntriesOutput = await answerRefusals(() =>
      this.listTrashEntries.execute({
        ...caller,
        after: toTrashPosition(query.cursor),
        limit: query.limit,
      }),
    );
    return toTrashEntryPage(page);
  }

  /**
   * Method purge
   *
   * @description
   * `DELETE /internal/v1/trash/entries/{entryId}`: erases the entry for good.
   *
   * @param {TrashEntryPath} path - The entry.
   * @returns {Promise<void>} Resolves with `204`.
   * @throws {ProblemException} `404 trash-entry.not-found`, `404 organization.not-found`.
   */
  @Delete('entries/:entryId')
  @HttpCode(204)
  public async purge(@Param() path: TrashEntryPath): Promise<void> {
    const caller: Caller = toCaller();
    await answerRefusals(() => this.purgeTrashEntry.execute({ ...caller, entryId: path.entryId }));
  }

  /**
   * Method restore
   *
   * @description
   * `POST /internal/v1/trash/entries/{entryId}/restore`: brings the entry back to its list.
   *
   * @param {RestoreTrashEntryBody} _body - The empty object of the contract, validated, not read.
   * @param {TrashEntryPath} path - The entry.
   * @returns {Promise<TrashRestored>} What came back.
   * @throws {ProblemException} `404 trash-entry.not-found`, `404 organization.not-found`.
   */
  @Post('entries/:entryId/restore')
  @HttpCode(200)
  public async restore(
    @Body() _body: RestoreTrashEntryBody,
    @Param() path: TrashEntryPath,
  ): Promise<TrashRestored> {
    const caller: Caller = toCaller();
    const restored: RestoreTrashEntryOutput = await answerRefusals(() =>
      this.restoreTrashEntry.execute({ ...caller, entryId: path.entryId }),
    );
    return toTrashRestored(restored);
  }

  /**
   * Method empty
   *
   * @description
   * `POST /internal/v1/trash/empty`: "Vider la corbeille".
   *
   * @param {EmptyTrashBody} body - The empty object of the contract, validated, not read: the
   * generated validator drops any member, so it carries nothing for the use case.
   * @param {Request} request - The request, whose route an answer of an unknown route names.
   * @returns {Promise<TrashEmptied>} The count of the entries handed to the purge, with `202`.
   * @throws {ProblemException} `404 http.not-found` while the switch is off,
   * `404 organization.not-found`.
   */
  @Post('empty')
  @HttpCode(202)
  public async empty(@Body() body: EmptyTrashBody, @Req() request: Request): Promise<TrashEmptied> {
    const caller: Caller = toCaller();
    const emptied: EmptyTrashOutput = await answerRefusals(
      () => this.emptyTrash.execute(toEmptyTrashInput(body, caller)),
      request,
    );
    return toTrashEmptied(emptied);
  }
  // #endregion
}
