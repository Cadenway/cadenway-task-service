import { decodeCursor, encodeCursor } from '@cadenway/nest-common';
import { deflateRawSync, inflateRawSync } from 'node:zlib';

import type { SprintReportPosition } from '../../../../application/models/reporting/sprint-report-position.model.js';
import type { SprintReportSnapshot } from '../../../../application/models/reporting/sprint-report-snapshot.model.js';
import { invalidCursor, isStoredInstant } from '../page/page-cursor.mapper.js';

const SNAPSHOT =
  /^(0|[1-9][0-9]{0,19}):(0|[1-9][0-9]{0,19}):(?:(?:0|[1-9][0-9]{0,19})(?:,(?:0|[1-9][0-9]{0,19}))*)?$/u;
const DAY = /^(?!0000)[0-9]{4}-[0-9]{2}-[0-9]{2}$/u;
const MAX_XID = 18_446_744_073_709_551_615n;
const MAX_CURSOR_LENGTH = 2048;
const MAX_SNAPSHOT_LENGTH = 32_768;
const MAX_OBSERVATION_BYTES = MAX_SNAPSHOT_LENGTH + 1024;

interface SnapshotIds {
  // #region Properties
  /** PostgreSQL transaction ID bounds and active transactions in ascending order. */
  readonly xmin: bigint;
  readonly xmax: bigint;
  readonly running: readonly bigint[];
  // #endregion
}

/** Checks PostgreSQL snapshot bounds and reads absolute IDs or cursor gaps between active IDs. */
function snapshotIds(snapshot: string, encodedAsGaps: boolean): SnapshotIds | null {
  if (snapshot.length > MAX_SNAPSHOT_LENGTH || !SNAPSHOT.test(snapshot)) return null;
  const [first, last, running] = snapshot.split(':');
  if (first === undefined || last === undefined || running === undefined) return null;
  const xmin = BigInt(first);
  const xmax = BigInt(last);
  if (xmin > xmax || xmax > MAX_XID) return null;
  let previous = xmin - 1n;
  const ids: bigint[] = [];
  for (const entry of running === '' ? [] : running.split(',')) {
    const value = BigInt(entry);
    const current = encodedAsGaps ? previous + 1n + value : value;
    if (current <= previous || current < xmin || current >= xmax) return null;
    ids.push(current);
    previous = current;
  }
  return { xmin, xmax, running: ids };
}

/** Saves cursor capacity by storing only how many XIDs separate active transactions. */
function snapshotGaps(snapshot: SprintReportSnapshot): string {
  const parsed = snapshotIds(snapshot, false);
  if (parsed === null) throw new Error('The report snapshot is invalid.');
  let previous = parsed.xmin - 1n;
  const gaps = parsed.running.map((id) => {
    const gap = id - previous - 1n;
    previous = id;
    return String(gap);
  });
  return [parsed.xmin, parsed.xmax, gaps.join(',')].join(':');
}

/** Checks a date from the cursor without allowing automatic rollover into the next month. */
function validDay(text: string): boolean {
  if (!DAY.test(text)) return false;
  const date = new Date(`${text}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text;
}

/** Decodes one compressed observation and rejects malformed snapshots or calendar bounds. */
function decodeObservation(
  encoded: string,
  date: string,
): Pick<SprintReportPosition, 'snapshot' | 'schedule'> {
  let observation: unknown;
  try {
    const bytes = Buffer.from(encoded, 'base64url');
    if (bytes.toString('base64url') !== encoded) throw invalidCursor();
    observation = JSON.parse(
      inflateRawSync(bytes, { maxOutputLength: MAX_OBSERVATION_BYTES }).toString('utf8'),
    );
  } catch {
    throw invalidCursor();
  }
  if (!Array.isArray(observation) || observation.length !== 4) throw invalidCursor();
  const parts: readonly unknown[] = observation;
  const [gaps, name, startDate, endDate] = parts;
  if (
    typeof gaps !== 'string' ||
    typeof name !== 'string' ||
    name.length < 1 ||
    Array.from(name).length > 80 ||
    typeof startDate !== 'string' ||
    !validDay(startDate) ||
    typeof endDate !== 'string' ||
    !validDay(endDate) ||
    date < startDate ||
    date >= endDate
  ) {
    throw invalidCursor();
  }
  const parsed = snapshotIds(gaps, true);
  if (parsed === null) throw invalidCursor();
  const snapshot = [parsed.xmin, parsed.xmax, parsed.running.join(',')].join(':');
  if (snapshot.length > MAX_SNAPSHOT_LENGTH) throw invalidCursor();
  return { snapshot: snapshot as SprintReportSnapshot, schedule: { name, startDate, endDate } };
}

/** Reads an internally scoped cursor previously authenticated by the API gateway. */
export function sprintReportPosition(
  cursor: string | undefined,
  scope: unknown,
): SprintReportPosition | null {
  if (cursor === undefined) return null;
  const value = decodeCursor(cursor, scope);
  const instant = value.sort[0];
  const observation = value.sort[1];
  if (
    value.sort.length !== 2 ||
    typeof instant !== 'string' ||
    typeof observation !== 'string' ||
    !/^[A-Za-z0-9_-]+$/u.test(observation) ||
    !validDay(value.id)
  )
    throw invalidCursor();
  const observedAt = new Date(instant);
  if (!isStoredInstant(instant, observedAt)) throw invalidCursor();
  return {
    date: value.id,
    serverObservedAt: observedAt,
    ...decodeObservation(observation, value.id),
  };
}

/** Encodes the historical observation for the gateway to authenticate on the public boundary. */
export function sprintReportCursor(
  position: SprintReportPosition | null,
  scope: unknown,
): string | null {
  if (position === null) return null;
  const { schedule, snapshot } = position;
  const observation = JSON.stringify([
    snapshotGaps(snapshot),
    schedule.name,
    schedule.startDate,
    schedule.endDate,
  ]);
  const compressed = deflateRawSync(Buffer.from(observation, 'utf8')).toString('base64url');
  const cursor = encodeCursor(
    { id: position.date, sort: [position.serverObservedAt.toISOString(), compressed] },
    scope,
  );
  if (cursor.length > MAX_CURSOR_LENGTH) {
    throw new Error('The report snapshot exceeds the supported cursor size.');
  }
  return cursor;
}
