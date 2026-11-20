import type { PriorityKey } from '../../../../../domain/value-objects/task/priority-key.value-object.js';
import type { StatusKey } from '../../../../../domain/value-objects/task/status-key.value-object.js';
import type { ExportListTasksSink } from '../../../../models/reporting/export-list-tasks-sink.model.js';
import { MAX_LIST_EXPORT_ROWS } from '../../../../models/reporting/reporting-export-rows.model.js';
import { ReportingRefusal } from '../../../../models/reporting/reporting-refusal.model.js';
import { TaskRefusal } from '../../../../models/task/task-refusal.model.js';
import type { MemberDirectory } from '../../../../ports/outbound/members/membership/member-directory.port.js';
import type { SpaceDirectory } from '../../../../ports/outbound/spaces/space/space-directory.port.js';
import type { ReportingUnitOfWork } from '../../../../ports/outbound/transactions/reporting/reporting-unit-of-work.port.js';
import { ViewerResolver } from '../../../../services/member/viewer-resolver.service.js';
import { TaskFilterBuilder } from '../../../../services/query/task-filter-builder.service.js';
import type { ExportListTasksInput } from './export-list-tasks.input.js';
import type { ExportListTasksOutput } from './export-list-tasks.output.js';

const statusLabels: Readonly<Record<StatusKey, string>> = {
  triage: 'À trier',
  backlog: 'À planifier',
  todo: 'À faire',
  progress: 'En cours',
  review: 'En revue',
  testing: 'En validation',
  waiting: 'En attente',
  blocked: 'Bloqué',
  done: 'Terminé',
  cancelled: 'Annulé',
};
const priorityLabels: Readonly<Record<PriorityKey, string>> = {
  urgente: 'Urgente',
  haute: 'Haute',
  moyenne: 'Moyenne',
  basse: 'Basse',
};

/** Quotes a spreadsheet cell and prevents leading formulas from being evaluated. */
function cell(value: string | number): string {
  const text = String(value);
  const literal =
    typeof value === 'string' && /^[\p{White_Space}\p{Cc}]*[=+\-@]/u.test(text) ? `'${text}` : text;
  return `"${literal.replaceAll('"', '""')}"`;
}

/** Exports the complete filtered list after enforcing the row limit in the snapshot. */
export class ExportListTasks {
  // #region Properties
  /** Report data and dependencies. */
  private readonly viewers: ViewerResolver;
  private readonly filters = new TaskFilterBuilder();
  // #endregion

  // #region Constructor
  /** Binds the report dependencies. */
  public constructor(
    private readonly work: ReportingUnitOfWork,
    members: MemberDirectory,
    private readonly spaces: SpaceDirectory,
  ) {
    this.viewers = new ViewerResolver(members);
  }
  // #endregion

  // #region Methods
  /** Validates before writing and delivers rows from one snapshot without replaying any writes. */
  public execute(
    input: ExportListTasksInput,
    sink: ExportListTasksSink,
  ): Promise<ExportListTasksOutput> {
    return this.work.runReadOnly(
      async (reader) => {
        input.signal?.throwIfAborted();
        const viewer = await this.viewers.resolve(input.organizationId, input.actorUserId);
        const placement = await this.spaces.findVisibleList(
          input.organizationId,
          viewer,
          input.listId,
        );
        if (placement === null) throw new TaskRefusal({ reason: 'list-not-found' });
        input.signal?.throwIfAborted();
        const data = await reader.prepareExport(
          input.organizationId,
          input.listId,
          placement.space.id,
          this.filters.build(input.filter, viewer.userId),
          input.order,
          input.sheetSort?.column === 'people' ? null : input.sheetSort,
          MAX_LIST_EXPORT_ROWS + 1,
        );
        if (data.invalidSort) throw new ReportingRefusal('sheet-column-invalid');
        if (data.rowCount > MAX_LIST_EXPORT_ROWS)
          throw new ReportingRefusal('export-row-limit-reached');
        input.signal?.throwIfAborted();
        const headers = [
          'Identifiant',
          'Nom',
          'Statut',
          'Priorité',
          'Assignés',
          'Échéance',
          'Étiquettes',
          ...data.fields.map((field) => field.name),
        ];
        const deliverRows = await sink.start({
          filename: `list-${input.listId}.csv`,
          header: headers.map(cell).join(';'),
        });
        if (!deliverRows) return { rowCount: data.rowCount };

        for (let offset = 0; offset < data.rowCount;) {
          input.signal?.throwIfAborted();
          const page = await data.readPage(offset);
          if (page.length === 0 || page.length > data.rowCount - offset) {
            throw new Error('The export page does not match its selected row count.');
          }
          for (const row of page) {
            input.signal?.throwIfAborted();
            await sink.row({
              beforeAssignees: [
                row.taskKey,
                row.name,
                statusLabels[row.status],
                priorityLabels[row.priority],
              ].map(cell),
              assigneeIds: row.assignees,
              afterAssignees: [
                row.dueDate ?? '',
                row.labels.join(', '),
                ...data.fields.map((field) => row.customValues[field.id] ?? ''),
              ].map(cell),
            });
          }
          offset += page.length;
        }
        input.signal?.throwIfAborted();
        return { rowCount: data.rowCount };
      },
      { maxAttempts: 1 },
    );
  }
  // #endregion
}
