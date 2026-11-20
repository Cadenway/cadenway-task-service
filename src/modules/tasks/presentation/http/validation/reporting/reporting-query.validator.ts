import type { RefinementCtx } from 'zod';

/** Refuses zones that cannot define local report dates. */
export function validateReportingZone(timeZone: string, context: RefinementCtx): void {
  try {
    if (timeZone.startsWith('+') || timeZone.startsWith('-')) throw new RangeError();
    new Intl.DateTimeFormat('en', { timeZone });
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    context.addIssue({
      code: 'custom',
      path: ['timeZone'],
      message: 'Expected an IANA time zone.',
    });
  }
}

/** Refuses non-Mondays and windows extending beyond the supported calendar. */
export function validateReportingWeek(start: string, length: 7 | 14, context: RefinementCtx): void {
  const date = new Date(`${start}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime())) return;
  const end = new Date(date.getTime() + (length - 1) * 86_400_000);
  if (date.getUTCDay() !== 1 || end.getUTCFullYear() > 9999) {
    context.addIssue({
      code: 'custom',
      path: ['weekStart'],
      message: 'Expected a Monday with a complete reporting window.',
    });
  }
}

/** Refuses a dashboard whose initial Monday precedes the supported calendar. */
export function validateDashboardWindow(
  today: string,
  weeks: 8 | 12,
  context: RefinementCtx,
): void {
  const date = new Date(`${today}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime())) return;
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  const first = new Date(date.getTime() - (daysSinceMonday + (weeks - 1) * 7) * 86_400_000);
  if (first.getUTCFullYear() < 1) {
    context.addIssue({
      code: 'custom',
      path: ['today'],
      message: 'Expected a date with a complete dashboard window.',
    });
  }
}
