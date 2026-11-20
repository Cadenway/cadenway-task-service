/** Task content of a verified, currently published intake submission. */
export interface CreateIntakeTaskInput {
  // #region Properties
  /** Verified tenant and target list. */
  readonly organizationId: string;
  readonly listId: string;
  readonly name: string;
  readonly description: string | null;
  readonly status:
    | 'triage'
    | 'backlog'
    | 'todo'
    | 'progress'
    | 'review'
    | 'testing'
    | 'waiting'
    | 'blocked'
    | 'done'
    | 'cancelled';
  readonly priority: 'urgente' | 'haute' | 'moyenne' | 'basse';
  readonly dueDate: string | null;
  readonly assigneeId: string | null;
  // #endregion
}
