import type { TaskTemplate } from '@cadenway/contracts/types/internal/task-service';

import type { TaskTemplateRecord } from '../../../../application/models/template/task-template-record.model.js';

/** Projects the stored template to the published HTTP response. */
export function toTaskTemplate(record: TaskTemplateRecord): TaskTemplate {
  return {
    id: record.id,
    spaceId: record.spaceId,
    name: record.name,
    title: record.title,
    description: record.description,
    priority: record.priority,
    labels: [...record.labels],
    checklist: [...record.checklist],
    subtasks: [...record.subtasks],
    createdAt: record.createdAt,
    version: record.version,
  };
}
