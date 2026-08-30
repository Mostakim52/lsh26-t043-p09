import { addDays, addMonths, daysBetween, formatDate, today as todayIso } from './dates';
import { formatKm } from './format';
import { DUE_SOON_DAYS } from './rules';
import type {
  DueStatus,
  IsoDate,
  ItemSchedule,
  Owner,
  ServiceItem,
  Vehicle,
  VehicleStatus,
} from './types';

/** A vehicle that has never been driven would divide by zero, so the rate has a floor. */
const MIN_KM_PER_DAY = 1;

export function statusFor(daysUntil: number): DueStatus {
  if (daysUntil < 0) return 'overdue';
  if (daysUntil <= DUE_SOON_DAYS) return 'dueSoon';
  return 'fine';
}

/**
 * Roll the odometer forward from the last reading at the vehicle's own daily rate.
 * A reading taken three weeks ago on a car doing 60 km/day is 1,260 km stale, and
 * ignoring that is how a brake pad job gets missed.
 */
export function projectOdometer(vehicle: Vehicle, asOf: IsoDate): number {
  const elapsed = Math.max(0, daysBetween(vehicle.odometer.readAt, asOf));
  return Math.round(vehicle.odometer.km + elapsed * vehicle.avgKmPerDay);
}

/**
 * Work out when one item falls due, using its own rule (requirement 2).
 * Every branch also produces the sentence the workshop reads down the phone.
 */
export function computeSchedule(
  item: ServiceItem,
  vehicle: Vehicle,
  asOf: IsoDate = todayIso(),
): ItemSchedule {
  const base = { item, vehicleId: vehicle.id };

  if (item.rule.kind === 'fixedDate') {
    const nextDueDate = item.rule.dueDate;
    const daysUntil = daysBetween(asOf, nextDueDate);
    return {
      ...base,
      nextDueDate,
      daysUntil,
      status: statusFor(daysUntil),
      estimated: false,
      why:
        daysUntil < 0
          ? `Expired ${formatDate(nextDueDate)}, ${Math.abs(daysUntil)} days ago. This is a fixed date on the document.`
          : `Expires ${formatDate(nextDueDate)}. This is a fixed date on the document, so driving less does not push it back.`,
    };
  }

  if (item.rule.kind === 'interval') {
    const { months, lastDoneDate } = item.rule;
    const nextDueDate = addMonths(lastDoneDate, months);
    const daysUntil = daysBetween(asOf, nextDueDate);
    return {
      ...base,
      nextDueDate,
      daysUntil,
      status: statusFor(daysUntil),
      estimated: false,
      why:
        `Last done ${formatDate(lastDoneDate)} and runs on a ${months}-month interval, ` +
        `so it falls due ${formatDate(nextDueDate)}` +
        (daysUntil < 0 ? `, ${Math.abs(daysUntil)} days ago.` : '.'),
    };
  }

  const { intervalKm, lastDoneOdometer } = item.rule;
  const rate = Math.max(MIN_KM_PER_DAY, vehicle.avgKmPerDay);
  const projectedKm = projectOdometer(vehicle, asOf);
  const dueAtKm = lastDoneOdometer + intervalKm;
  const kmRemaining = dueAtKm - projectedKm;
  const daysUntil = Math.round(kmRemaining / rate);
  const nextDueDate = addDays(asOf, daysUntil);

  return {
    ...base,
    nextDueDate,
    daysUntil,
    status: statusFor(daysUntil),
    estimated: true,
    dueAtKm,
    kmRemaining,
    projectedKm,
    why:
      kmRemaining < 0
        ? `Due at ${formatKm(dueAtKm)}. The odometer read ${formatKm(vehicle.odometer.km)} on ` +
          `${formatDate(vehicle.odometer.readAt)} and this vehicle runs about ${rate} km/day, ` +
          `so it is on roughly ${formatKm(projectedKm)} today — ${formatKm(Math.abs(kmRemaining))} past due.`
        : `Due at ${formatKm(dueAtKm)}. Projected ${formatKm(projectedKm)} today, so about ` +
          `${formatKm(kmRemaining)} left — roughly ${daysUntil} days at ${rate} km/day.`,
  };
}

/** Grade every item on a vehicle and roll it up. */
export function computeVehicleStatus(
  vehicle: Vehicle,
  owner: Owner,
  asOf: IsoDate = todayIso(),
): VehicleStatus {
  const schedules = vehicle.items
    .map((item) => computeSchedule(item, vehicle, asOf))
    .sort((a, b) => a.daysUntil - b.daysUntil);

  const overdue = schedules.filter((s) => s.status === 'overdue');
  const dueSoon = schedules.filter((s) => s.status === 'dueSoon');
  const fine = schedules.filter((s) => s.status === 'fine');

  const worst: DueStatus = overdue.length ? 'overdue' : dueSoon.length ? 'dueSoon' : 'fine';
  const worstDaysOverdue = overdue.length ? Math.abs(overdue[0].daysUntil) : 0;
  const dueValue = [...overdue, ...dueSoon].reduce((sum, s) => sum + s.item.cost, 0);

  return {
    vehicle,
    owner,
    schedules,
    overdue,
    dueSoon,
    fine,
    worst,
    worstDaysOverdue,
    dueValue,
    projectedKm: projectOdometer(vehicle, asOf),
  };
}
