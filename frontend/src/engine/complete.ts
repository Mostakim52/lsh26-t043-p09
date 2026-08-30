import { addMonths } from './dates';
import type { Fleet, IsoDate, ServiceItem, ServiceRecord } from './types';

export interface CompletionInput {
  vehicleId: string;
  itemId: string;
  date: IsoDate;
  /** Odometer on the day the work was done. */
  odometer: number;
  cost: number;
  technician: string;
  notes?: string;
}

/**
 * Reset one item's rule from the work that was just done (requirement 4).
 *
 *   fixed date  the document is reissued, so the date moves on by its renewal term
 *   interval    the clock restarts from the day the work was done
 *   distance    the counter restarts from the odometer at the time of the work
 */
export function resetRule(item: ServiceItem, date: IsoDate, odometer: number): ServiceItem {
  switch (item.rule.kind) {
    case 'fixedDate':
      return { ...item, rule: { ...item.rule, dueDate: addMonths(date, item.rule.renewalMonths) } };
    case 'interval':
      return { ...item, rule: { ...item.rule, lastDoneDate: date } };
    case 'distance':
      return {
        ...item,
        rule: { ...item.rule, lastDoneOdometer: odometer, lastDoneDate: date },
      };
  }
}

export interface CompletionResult {
  fleet: Fleet;
  record: ServiceRecord;
}

/**
 * Record a completed service. Returns a new Fleet — the item is reset, the service
 * history grows by one record, and the odometer moves up if the workshop read a
 * higher number than the one on file.
 *
 * Throws when the vehicle or item is unknown, so a bad id surfaces immediately
 * rather than silently doing nothing.
 */
export function completeService(fleet: Fleet, input: CompletionInput): CompletionResult {
  const vehicle = fleet.vehicles.find((v) => v.id === input.vehicleId);
  if (!vehicle) throw new Error(`Unknown vehicle: ${input.vehicleId}`);

  const item = vehicle.items.find((i) => i.id === input.itemId);
  if (!item) throw new Error(`Unknown item ${input.itemId} on vehicle ${input.vehicleId}`);

  const record: ServiceRecord = {
    id: `SR-${input.vehicleId}-${item.code}-${input.date}-${fleet.history.length + 1}`,
    vehicleId: input.vehicleId,
    itemCode: item.code,
    label: item.label,
    date: input.date,
    odometer: input.odometer,
    cost: input.cost,
    technician: input.technician,
    ...(input.notes ? { notes: input.notes } : {}),
  };

  const odometerMovedOn = input.odometer > vehicle.odometer.km;

  const nextVehicle = {
    ...vehicle,
    odometer: odometerMovedOn ? { km: input.odometer, readAt: input.date } : vehicle.odometer,
    items: vehicle.items.map((i) =>
      i.id === item.id ? resetRule(i, input.date, input.odometer) : i,
    ),
  };

  return {
    fleet: {
      ...fleet,
      vehicles: fleet.vehicles.map((v) => (v.id === vehicle.id ? nextVehicle : v)),
      history: [record, ...fleet.history],
    },
    record,
  };
}

/** Service history for one vehicle, newest first. */
export function historyForVehicle(fleet: Fleet, vehicleId: string): ServiceRecord[] {
  return fleet.history
    .filter((r) => r.vehicleId === vehicleId)
    .sort((a, b) => b.date.localeCompare(a.date));
}
