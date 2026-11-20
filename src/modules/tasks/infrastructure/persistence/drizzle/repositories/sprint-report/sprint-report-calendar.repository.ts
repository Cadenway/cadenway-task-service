import { Temporal } from 'temporal-polyfill';

/** A local calendar day with inclusive millisecond bounds. */
interface LocalDay {
  // #region Properties
  /** Local date and its corresponding UTC instants. */
  readonly date: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
  // #endregion
}

/** Resolves a local day in its IANA zone, including daylight-saving transitions. */
export function sprintLocalDay(date: string, timeZone: string): LocalDay {
  const day = Temporal.PlainDate.from(date, { overflow: 'reject' });
  const startsAt = day.toZonedDateTime(timeZone).epochMilliseconds;
  const nextStart = day.add({ days: 1 }).toZonedDateTime(timeZone).epochMilliseconds;
  return {
    date: day.toString(),
    startsAt: new Date(startsAt),
    endsAt: new Date(nextStart - 1),
  };
}

/** Returns the local day containing an observation instant. */
export function sprintObservedDay(instant: Date, timeZone: string): LocalDay {
  const date = Temporal.Instant.fromEpochMilliseconds(instant.getTime())
    .toZonedDateTimeISO(timeZone)
    .toPlainDate()
    .toString();
  return sprintLocalDay(date, timeZone);
}

/** Pages sprint dates without allocating the remaining calendar. */
export function sprintCalendarPage(
  start: string,
  end: string,
  after: string | null,
  limit: number,
  timeZone: string,
): { readonly days: readonly LocalDay[]; readonly next: string | null } {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error('A sprint calendar page must contain between 1 and 100 days.');
  }
  const first = Temporal.PlainDate.from(start, { overflow: 'reject' });
  const last = Temporal.PlainDate.from(end, { overflow: 'reject' });
  if (Temporal.PlainDate.compare(first, last) > 0) {
    throw new Error('A sprint must end on or after its first day.');
  }
  let position =
    after === null
      ? first
      : Temporal.PlainDate.from(after, { overflow: 'reject' }).add({ days: 1 });
  if (Temporal.PlainDate.compare(position, first) < 0) position = first;
  const days: LocalDay[] = [];
  while (days.length < limit && Temporal.PlainDate.compare(position, last) <= 0) {
    days.push(sprintLocalDay(position.toString(), timeZone));
    position = position.add({ days: 1 });
  }
  return {
    days,
    next: Temporal.PlainDate.compare(position, last) <= 0 ? (days.at(-1)?.date ?? null) : null,
  };
}

/** Selects the last two fully observed dates from bounded covered lifecycle intervals. */
export function sprintTrendDates(
  intervals: readonly { readonly startDate: string; readonly endDate: string }[],
  observedAt: Date,
  timeZone: string,
): readonly LocalDay[] {
  const observedDay = sprintObservedDay(observedAt, timeZone);
  let latest = Temporal.PlainDate.from(observedDay.date);
  if (observedDay.endsAt > observedAt) latest = latest.subtract({ days: 1 });
  const results = new Map<string, LocalDay>();
  for (const interval of intervals) {
    const first = Temporal.PlainDate.from(interval.startDate, { overflow: 'reject' });
    const last = Temporal.PlainDate.from(interval.endDate, { overflow: 'reject' });
    let day = Temporal.PlainDate.compare(last, latest) < 0 ? last : latest;
    for (let count = 0; count < 2 && Temporal.PlainDate.compare(day, first) >= 0; count += 1) {
      const local = sprintLocalDay(day.toString(), timeZone);
      results.set(local.date, local);
      day = day.subtract({ days: 1 });
    }
  }
  return [...results.values()].sort((left, right) => left.date.localeCompare(right.date)).slice(-2);
}
