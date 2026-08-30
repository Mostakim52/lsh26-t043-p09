import type { RuleKind } from './types';

/**
 * Every threshold and weight the scheduler uses. The Rules screen renders from these
 * same constants, so what the workshop reads is what the calculation ran.
 */

/** An item falling due within this many days counts as "due soon". */
export const DUE_SOON_DAYS = readNumberEnv('VITE_DUE_SOON_DAYS', 30);

/**
 * How the daily call list is ordered. The brief asks for the most overdue and the
 * highest value work first, so the score blends all three rather than sorting on one:
 *
 *   urgency    days already past due, the strongest signal
 *   imminence  how close a not-yet-due item is to its date
 *   value      the money on the table, so a big job is not buried under small ones
 *
 * The UI shows this breakdown per row, so nobody has to trust the number blindly.
 */
export const PRIORITY_WEIGHTS = {
  /** Points per day overdue. */
  perOverdueDay: 6,
  /** Points per day of closeness inside the due-soon window. */
  perImminenceDay: 1.5,
  /** Points per unit of currency of due work. 25,000 BDT scores 100. */
  perCurrencyUnit: 0.004,
} as const;

export const RULE_LABELS: Record<RuleKind, string> = {
  fixedDate: 'Fixed date',
  interval: 'Time interval',
  distance: 'Distance',
};

export const RULE_DOCS: Record<RuleKind, { title: string; text: string; examples: string }> = {
  fixedDate: {
    title: 'Fixed date',
    text:
      'The date is printed on a document, so it is used as-is. Nothing about how the ' +
      'vehicle is driven changes it.',
    examples: 'Insurance renewal, fitness certificate, tax token',
  },
  interval: {
    title: 'Time interval',
    text:
      'Due a set number of months after the work was last done. Next due = last done ' +
      'date + interval, clamped to the end of the month so 31 January + 1 month lands ' +
      'on 28 February.',
    examples: 'Engine oil and filter, coolant flush, AC service, battery check',
  },
  distance: {
    title: 'Distance',
    text:
      'Due a set number of kilometres after the work was last done. The odometer is ' +
      'first rolled forward from the last reading at the vehicle’s own daily running ' +
      'rate, then the kilometres remaining are divided by that same rate to estimate a ' +
      'date. A date produced this way is marked as an estimate everywhere it appears.',
    examples: 'Brake pads, tyres, timing belt, spark plugs, wheel alignment',
  },
};

export const STATUS_DOCS = {
  overdue: 'The due date has passed. Call today.',
  dueSoon: `Falls due within ${DUE_SOON_DAYS} days. Book it now.`,
  fine: 'Nothing to do yet.',
} as const;

function readNumberEnv(key: string, fallback: number): number {
  const raw = import.meta.env?.[key as keyof ImportMetaEnv];
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
