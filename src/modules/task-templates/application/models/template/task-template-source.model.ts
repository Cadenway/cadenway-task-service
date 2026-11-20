import type { TaskTemplateDraft } from './task-template-draft.model.js';

/** Source snapshot or a documented refusal from the task owner. */
export type TaskTemplateSource =
  | {
      readonly outcome: 'found';
      readonly source: Omit<TaskTemplateDraft, 'organizationId' | 'spaceId' | 'name'> & {
        readonly listId: string;
      };
    }
  | {
      readonly outcome: 'refused';
      readonly status: 403 | 404 | 409;
      readonly code: string;
      readonly details?: Readonly<Record<string, unknown>>;
    };
