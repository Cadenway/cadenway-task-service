import type {
  ArchivedListPage as ArchivedListPageBody,
  ArchivedTaskPage as ArchivedTaskPageBody,
} from '@cadenway/contracts/types/internal/task-service';
import { InternalAccess } from '@cadenway/nest-common';
import { Controller, Get, Query } from '@nestjs/common';

import type { Caller } from '../../../../application/models/caller/caller.model.js';
import type { ListArchivedListsOutput } from '../../../../application/use-cases/queries/archive/list-archived-lists/list-archived-lists.output.js';
import { ListArchivedLists } from '../../../../application/use-cases/queries/archive/list-archived-lists/list-archived-lists.use-case.js';
import type { ListArchivedTasksOutput } from '../../../../application/use-cases/queries/archive/list-archived-tasks/list-archived-tasks.output.js';
import { ListArchivedTasks } from '../../../../application/use-cases/queries/archive/list-archived-tasks/list-archived-tasks.use-case.js';
import { ArchivedListsQuery } from '../../dto/input/archive/archived-lists-query.dto.js';
import { ArchivedTasksQuery } from '../../dto/input/archive/archived-tasks-query.dto.js';
import { answerRefusals } from '../../errors/task/task-refusal.problem.js';
import { toArchivesPosition } from '../../mappers/archive/archive-cursor.mapper.js';
import { toArchivedListPage } from '../../mappers/archive/archived-list-page.mapper.js';
import { toArchivedTaskPage } from '../../mappers/archive/archived-task-page.mapper.js';
import { toCaller } from '../../mappers/caller/caller.mapper.js';

/**
 * Class ArchivesController
 *
 * @description
 * The page "Archives", `GET /internal/v1/archives/lists` (`listArchivedListsInternal`) and
 * `GET /internal/v1/archives/tasks` (`listArchivedTasksInternal`) of
 * `openapi/internal/task-service.yaml`. They accept the issuer `api-gateway` only, with the actor
 * `user` and an organization. The actor and the organization come from the verified internal
 * token, never from the request. The answers carry no `ETag`: the contract declares none. The
 * controller validates, maps and delegates: what the actor sees and the counts belong to the use
 * cases.
 */
@Controller('internal/v1/archives')
@InternalAccess({ issuers: ['api-gateway'], actors: ['user'], organization: 'required' })
export class ArchivesController {
  // #region Properties
  /**
   * Property listArchivedLists
   *
   * @description
   * Use case of the tab "Listes".
   *
   * @type {ListArchivedLists}
   * @readonly
   */
  private readonly listArchivedLists: ListArchivedLists;

  /**
   * Property listArchivedTasks
   *
   * @description
   * Use case of the tab "Tâches".
   *
   * @type {ListArchivedTasks}
   * @readonly
   */
  private readonly listArchivedTasks: ListArchivedTasks;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Takes the use cases, provided by `TasksModule`.
   *
   * @param {ListArchivedLists} listArchivedLists - Use case of the tab "Listes".
   * @param {ListArchivedTasks} listArchivedTasks - Use case of the tab "Tâches".
   * @constructor
   */
  public constructor(listArchivedLists: ListArchivedLists, listArchivedTasks: ListArchivedTasks) {
    this.listArchivedLists = listArchivedLists;
    this.listArchivedTasks = listArchivedTasks;
  }
  // #endregion

  // #region Methods
  /**
   * Method lists
   *
   * @description
   * `GET /internal/v1/archives/lists`: `200` with one page of the archived lists the actor has a
   * role on, the most recently archived first, each with the count of its live top-level tasks,
   * and `total` on every page.
   *
   * @param {ArchivedListsQuery} query - The cursor and the page size.
   * @returns {Promise<ArchivedListPageBody>} The page.
   * @throws {ProblemException} `400 request.invalid` for a cursor that is not one of this tab, or
   * `404 organization.not-found`.
   */
  @Get('lists')
  public async lists(@Query() query: ArchivedListsQuery): Promise<ArchivedListPageBody> {
    const caller: Caller = toCaller();
    const page: ListArchivedListsOutput = await answerRefusals(() =>
      this.listArchivedLists.execute({
        ...caller,
        after: toArchivesPosition(query.cursor, 'archived-lists'),
        limit: query.limit,
      }),
    );
    return toArchivedListPage(page);
  }

  /**
   * Method tasks
   *
   * @description
   * `GET /internal/v1/archives/tasks`: `200` with one page of the roots of the archives the actor
   * sees, the most recently archived first, each with its list and the number of subtasks archived
   * with it, and `total` on every page.
   *
   * @param {ArchivedTasksQuery} query - The cursor and the page size.
   * @returns {Promise<ArchivedTaskPageBody>} The page.
   * @throws {ProblemException} `400 request.invalid` for a cursor that is not one of this tab, or
   * `404 organization.not-found`.
   */
  @Get('tasks')
  public async tasks(@Query() query: ArchivedTasksQuery): Promise<ArchivedTaskPageBody> {
    const caller: Caller = toCaller();
    const page: ListArchivedTasksOutput = await answerRefusals(() =>
      this.listArchivedTasks.execute({
        ...caller,
        after: toArchivesPosition(query.cursor, 'archived-tasks'),
        limit: query.limit,
      }),
    );
    return toArchivedTaskPage(page);
  }
  // #endregion
}
