import type { SprintReportProjection } from '../../../../../domain/value-objects/reporting/sprint-report-projection.value-object.js';
import type { SprintReportPosition } from '../../../../models/reporting/sprint-report-position.model.js';

/** Domain projection and the information the HTTP boundary binds into the next cursor. */
export type GetSprintReportOutput = SprintReportProjection & {
  readonly next: SprintReportPosition | null;
};
