/** The task statuses from `components/task.yaml`, used as defaults in `components/intake.yaml`. */
export type IntakeStatus =
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
