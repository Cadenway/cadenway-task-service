import type { CreateTask } from '../../task/create-task/create-task.use-case.js';
import type { CreateOnboardingExampleInput } from './create-onboarding-example.input.js';

/** Creates one onboarding example using the ordinary task command and outbox. */
export class CreateOnboardingExample {
  // #region Constructor
  /** Uses the task creation command in the provisioning transaction. */
  public constructor(private readonly createTask: CreateTask) {}
  // #endregion

  // #region Methods
  /** Creates a root task assigned to the verified actor. */
  public async execute(input: CreateOnboardingExampleInput): Promise<void> {
    await this.createTask.executeExample({
      ...input,
      cancelReason: null,
      cancelNote: null,
      priority: 'moyenne',
      assigneeIds: [input.actorUserId],
      dueDate: null,
      startDate: null,
      estimateMinutes: null,
      labels: [],
      subtaskNames: [],
    });
  }
  // #endregion
}
