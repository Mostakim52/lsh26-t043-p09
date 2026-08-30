import { relativeDays, today as todayIso } from './dates';
import { formatMoney } from './format';
import { DUE_SOON_DAYS, PRIORITY_WEIGHTS } from './rules';
import { computeVehicleStatus } from './schedule';
import type {
  CallListEntry,
  Fleet,
  IsoDate,
  PriorityBreakdown,
  VehicleStatus,
} from './types';

/**
 * Score one vehicle for the daily call list (requirement 3).
 *
 * Three components, all visible in the UI:
 *   urgency    how far past due the worst item already is
 *   imminence  how close the nearest item is inside the due-soon window
 *   value      the money on the table
 *
 * An overdue vehicle always carries the full imminence points as well, so the score
 * rises monotonically as an item slides from fine, to due soon, to late.
 */
export function scoreVehicle(status: VehicleStatus): PriorityBreakdown {
  const nearest = status.schedules[0];
  const daysUntil = nearest ? nearest.daysUntil : Number.POSITIVE_INFINITY;

  const urgency = Math.max(0, -daysUntil) * PRIORITY_WEIGHTS.perOverdueDay;
  const imminenceDays =
    daysUntil < 0 ? DUE_SOON_DAYS : Math.max(0, DUE_SOON_DAYS - daysUntil);
  const imminence = imminenceDays * PRIORITY_WEIGHTS.perImminenceDay;
  const value = status.dueValue * PRIORITY_WEIGHTS.perCurrencyUnit;

  return {
    urgency: round1(urgency),
    imminence: round1(imminence),
    value: round1(value),
    total: round1(urgency + imminence + value),
  };
}

/**
 * The workshop's call sheet: who to ring, about which vehicle, which items and why.
 * Only vehicles with something overdue or due soon appear.
 */
export function buildCallList(fleet: Fleet, asOf: IsoDate = todayIso()): CallListEntry[] {
  const ownersById = new Map(fleet.owners.map((o) => [o.id, o]));

  const entries: CallListEntry[] = [];
  for (const vehicle of fleet.vehicles) {
    const owner = ownersById.get(vehicle.ownerId);
    if (!owner) continue;

    const status = computeVehicleStatus(vehicle, owner, asOf);
    if (!status.overdue.length && !status.dueSoon.length) continue;

    entries.push({
      vehicleStatus: status,
      priority: scoreVehicle(status),
      talkingPoints: [...status.overdue, ...status.dueSoon].map(
        (s) => `${s.item.label} — ${relativeDays(s.daysUntil)}, ${formatMoney(s.item.cost)}. ${s.why}`,
      ),
    });
  }

  return entries.sort((a, b) => {
    if (b.priority.total !== a.priority.total) return b.priority.total - a.priority.total;
    // Stable tie-break so the list does not shuffle between renders.
    return a.vehicleStatus.vehicle.plate.localeCompare(b.vehicleStatus.vehicle.plate);
  });
}

/** Roll the whole fleet up for the dashboard tiles. */
export function summariseFleet(fleet: Fleet, asOf: IsoDate = todayIso()) {
  const ownersById = new Map(fleet.owners.map((o) => [o.id, o]));
  const statuses = fleet.vehicles
    .map((v) => {
      const owner = ownersById.get(v.ownerId);
      return owner ? computeVehicleStatus(v, owner, asOf) : null;
    })
    .filter((s): s is VehicleStatus => s !== null);

  const items = statuses.flatMap((s) => s.schedules);

  return {
    statuses,
    vehicles: statuses.length,
    owners: fleet.owners.length,
    itemsTracked: items.length,
    overdueItems: items.filter((s) => s.status === 'overdue').length,
    dueSoonItems: items.filter((s) => s.status === 'dueSoon').length,
    fineItems: items.filter((s) => s.status === 'fine').length,
    vehiclesOverdue: statuses.filter((s) => s.worst === 'overdue').length,
    vehiclesDueSoon: statuses.filter((s) => s.worst === 'dueSoon').length,
    /** Value of everything overdue or due soon across the fleet. */
    pipelineValue: statuses.reduce((sum, s) => sum + s.dueValue, 0),
    overdueValue: statuses.reduce(
      (sum, s) => sum + s.overdue.reduce((n, i) => n + i.item.cost, 0),
      0,
    ),
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
