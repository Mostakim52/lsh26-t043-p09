import type { IsoDate } from './types';

/**
 * Date-only maths in UTC. Everything in the system is a calendar date, so working in
 * UTC keeps a service that falls due on the 1st from drifting to the 31st when the
 * browser sits in a different timezone or crosses a DST boundary.
 */

export function parseIso(date: IsoDate): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, (m ?? 1) - 1, d ?? 1);
}

export function toIso(stamp: number): IsoDate {
  return new Date(stamp).toISOString().slice(0, 10);
}

/** Today as a calendar date, in the browser's own timezone. */
export function today(): IsoDate {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return toIso(parseIso(date) + Math.round(days) * 86_400_000);
}

/**
 * Add whole months, clamping to the end of the target month so that
 * 31 January + 1 month is 28 February rather than spilling into March.
 */
export function addMonths(date: IsoDate, months: number): IsoDate {
  const [y, m, d] = date.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  return toIso(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(d, lastDay)));
}

/** Whole days from `from` to `to`. Negative when `to` is in the past. */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((parseIso(to) - parseIso(from)) / 86_400_000);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatDate(date: IsoDate): string {
  const [y, m, d] = date.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

export function formatShortDate(date: IsoDate): string {
  const [, m, d] = date.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

/** "12 days overdue", "due today", "in 3 weeks". */
export function relativeDays(days: number): string {
  if (days < 0) {
    const n = Math.abs(days);
    return n === 1 ? '1 day overdue' : `${n} days overdue`;
  }
  if (days === 0) return 'due today';
  if (days === 1) return 'due tomorrow';
  if (days < 14) return `in ${days} days`;
  if (days < 60) return `in ${Math.round(days / 7)} weeks`;
  return `in ${Math.round(days / 30)} months`;
}
