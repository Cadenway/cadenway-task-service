import type {
  Home,
  MyTaskPage as MyTaskPageBody,
} from '@cadenway/contracts/types/internal/task-service';
import { InternalAccess } from '@cadenway/nest-common';
import { Controller, Get, Param, Query } from '@nestjs/common';

import type { Caller } from '../../../../application/models/caller/caller.model.js';
import type { GetHomeOutput } from '../../../../application/use-cases/queries/user/get-home/get-home.output.js';
import { GetHome } from '../../../../application/use-cases/queries/user/get-home/get-home.use-case.js';
import type { ListMyTasksOutput } from '../../../../application/use-cases/queries/user/list-my-tasks/list-my-tasks.output.js';
import { ListMyTasks } from '../../../../application/use-cases/queries/user/list-my-tasks/list-my-tasks.use-case.js';
import { HomePath } from '../../dto/input/user/home-path.dto.js';
import { HomeQuery } from '../../dto/input/user/home-query.dto.js';
import { MyTasksPath } from '../../dto/input/user/my-tasks-path.dto.js';
import { MyTasksQuery } from '../../dto/input/user/my-tasks-query.dto.js';
import { answerRefusals } from '../../errors/task/task-refusal.problem.js';
import { toCaller } from '../../mappers/caller/caller.mapper.js';
import { toHome } from '../../mappers/user/home.mapper.js';
import { toMyTaskCursor, toMyTaskPosition } from '../../mappers/user/my-task-cursor.mapper.js';
import { toMyTaskPage } from '../../mappers/user/my-task-page.mapper.js';

/**
 * Class UserTasksController
 *
 * @description
 * The pages of the actor, `GET /internal/v1/users/{userId}/tasks` ("Mes tâches") and
 * `GET /internal/v1/users/{userId}/home` ("Accueil") of `openapi/internal/task-service.yaml`. It
 * accepts the issuer `api-gateway` only, with the actor `user` and an organization. The actor and
 * the organization come from the verified internal token, never from the request, and the `userId`
 * of the path must be the actor: another account answers `404 user.not-found` from the use case.
 * The controller validates, maps and delegates. The answers carry no `ETag`: the contract declares
 * none.
 */
@Controller('internal/v1/users')
@InternalAccess({ issuers: ['api-gateway'], actors: ['user'], organization: 'required' })
export class UserTasksController {
  // #region Properties
  /**
   * Property listMyTasks
   *
   * @description
   * Use case of "Mes tâches".
   *
   * @type {ListMyTasks}
   * @readonly
   */
  private readonly listMyTasks: ListMyTasks;

  /**
   * Property getHome
   *
   * @description
   * Use case of "Accueil".
   *
   * @type {GetHome}
   * @readonly
   */
  private readonly getHome: GetHome;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Takes the use cases, provided by `TasksModule`.
   *
   * @param {ListMyTasks} listMyTasks - Use case of "Mes tâches".
   * @param {GetHome} getHome - Use case of "Accueil".
   * @constructor
   */
  public constructor(listMyTasks: ListMyTasks, getHome: GetHome) {
    this.listMyTasks = listMyTasks;
    this.getHome = getHome;
  }
  // #endregion

  // #region Methods
  /**
   * Method listTasks
   *
   * @description
   * `GET /internal/v1/users/{userId}/tasks`: `200` with one page of the tasks assigned to the
   * actor in the spaces they see, subtasks included, of the tab `state`, by due date (undated last)
   * then creation, and the number of tasks of each tab.
   *
   * @param {MyTasksPath} path - The account of the actor.
   * @param {MyTasksQuery} query - The tab, the cursor and the page size.
   * @returns {Promise<MyTaskPageBody>} The page.
   * @throws {ProblemException} `400 request.invalid` for a cursor that is not one of this
   * collection, `404 user.not-found` for another account or `404 organization.not-found`.
   */
  @Get(':userId/tasks')
  public async listTasks(
    @Param() path: MyTasksPath,
    @Query() query: MyTasksQuery,
  ): Promise<MyTaskPageBody> {
    const caller: Caller = toCaller();
    const page: ListMyTasksOutput = await answerRefusals(() =>
      this.listMyTasks.execute({
        ...caller,
        userId: path.userId.toLowerCase(),
        state: query.state,
        after: toMyTaskPosition(query.cursor, path.userId, query.state),
        limit: query.limit,
      }),
    );
    return toMyTaskPage(page, toMyTaskCursor(page.next, path.userId, query.state));
  }

  /**
   * Method home
   *
   * @description
   * `GET /internal/v1/users/{userId}/home`: `200` with the statistics of the tasks assigned to the
   * actor, their next priorities, the current sprints and the first lists, read in one snapshot.
   *
   * @param {HomePath} path - The account of the actor.
   * @param {HomeQuery} query - The date of the caller.
   * @returns {Promise<Home>} The home.
   * @throws {ProblemException} `404 user.not-found` for another account or
   * `404 organization.not-found`.
   */
  @Get(':userId/home')
  public async home(@Param() path: HomePath, @Query() query: HomeQuery): Promise<Home> {
    const caller: Caller = toCaller();
    const home: GetHomeOutput = await answerRefusals(() =>
      this.getHome.execute({
        ...caller,
        userId: path.userId.toLowerCase(),
        today: query.today,
      }),
    );
    return toHome(home);
  }
  // #endregion
}
