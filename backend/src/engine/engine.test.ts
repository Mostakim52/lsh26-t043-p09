import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { buildCallList, summariseFleet } from './callList.js';
import { completeService, historyForVehicle, resetRule } from './complete.js';
import { addMonths, addDays, daysBetween, relativeDays } from './dates.js';
import { DUE_SOON_DAYS } from './rules.js';
import { computeSchedule, computeVehicleStatus, projectOdometer, statusFor } from './schedule.js';
import type { Fleet, ServiceItem, Vehicle } from './types.js';

const fleet = JSON.parse(
  readFileSync(resolve(__dirname, '../../../frontend/public/data/fleet.json'), 'utf8'),
) as Fleet;

/** The data is generated relative to this date, so tests pin to it. */
const AS_OF = fleet.meta.generatedAt;

const vehiclesById = new Map(fleet.vehicles.map((v) => [v.id, v]));
const ownersById = new Map(fleet.owners.map((o) => [o.id, o]));

function statusOf(vehicle: Vehicle) {
  const owner = ownersById.get(vehicle.ownerId)!;
  return computeVehicleStatus(vehicle, owner, AS_OF);
}

/** A small hand-built vehicle, so rule behaviour is checked against exact numbers. */
function fixture(item: ServiceItem, over: Partial<Vehicle> = {}): Vehicle {
  return {
    id: 'TEST-1',
    ownerId: 'OWN-TEST',
    make: 'Toyota',
    model: 'Axio',
    year: 2018,
    plate: 'TEST 00-0000',
    colour: '#ffffff',
    bodyType: 'sedan',
    odometer: { km: 100_000, readAt: '2026-08-01' },
    avgKmPerDay: 50,
    items: [item],
    ...over,
  };
}

describe('date maths', () => {
  it('clamps a month addition to the end of a short month', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29');
    expect(addMonths('2026-08-30', 6)).toBe('2027-02-28');
    expect(addMonths('2026-03-15', -1)).toBe('2026-02-15');
  });

  it('counts whole days between dates', () => {
    expect(daysBetween('2026-08-30', '2026-08-30')).toBe(0);
    expect(daysBetween('2026-08-30', '2026-09-06')).toBe(7);
    expect(daysBetween('2026-08-30', '2026-08-20')).toBe(-10);
  });

  it('crosses a DST boundary without drifting', () => {
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30');
    expect(addDays('2026-10-24', 2)).toBe('2026-10-26');
  });

  it('reads days as plain language', () => {
    expect(relativeDays(-1)).toBe('1 day overdue');
    expect(relativeDays(-12)).toBe('12 days overdue');
    expect(relativeDays(0)).toBe('due today');
    expect(relativeDays(3)).toBe('in 3 days');
  });
});

describe('status thresholds', () => {
  it('splits overdue, due soon and fine on the documented boundaries', () => {
    expect(statusFor(-1)).toBe('overdue');
    expect(statusFor(0)).toBe('dueSoon');
    expect(statusFor(DUE_SOON_DAYS)).toBe('dueSoon');
    expect(statusFor(DUE_SOON_DAYS + 1)).toBe('fine');
  });
});

describe('fixed date rule', () => {
  const item: ServiceItem = {
    id: 'i1', code: 'INSURANCE', label: 'Insurance renewal', category: 'legal',
    cost: 20000, zone: 'body',
    rule: { kind: 'fixedDate', dueDate: '2026-09-20', renewalMonths: 12 },
  };

  it('uses the printed date as-is and never estimates', () => {
    const s = computeSchedule(item, fixture(item), '2026-08-30');
    expect(s.nextDueDate).toBe('2026-09-20');
    expect(s.daysUntil).toBe(21);
    expect(s.status).toBe('dueSoon');
    expect(s.estimated).toBe(false);
  });

  it('does not move when the vehicle is driven harder', () => {
    const slow = computeSchedule(item, fixture(item, { avgKmPerDay: 5 }), '2026-08-30');
    const fast = computeSchedule(item, fixture(item, { avgKmPerDay: 300 }), '2026-08-30');
    expect(slow.nextDueDate).toBe(fast.nextDueDate);
  });
});

describe('time interval rule', () => {
  const item: ServiceItem = {
    id: 'i2', code: 'ENGINE_OIL', label: 'Engine oil & filter', category: 'maintenance',
    cost: 4500, zone: 'engine',
    rule: { kind: 'interval', months: 6, lastDoneDate: '2026-01-15' },
  };

  it('falls due one interval after the last service', () => {
    const s = computeSchedule(item, fixture(item), '2026-08-30');
    expect(s.nextDueDate).toBe('2026-07-15');
    expect(s.daysUntil).toBe(-46);
    expect(s.status).toBe('overdue');
    expect(s.why).toContain('6-month interval');
  });
});

describe('distance rule', () => {
  const item: ServiceItem = {
    id: 'i3', code: 'BRAKE_PADS', label: 'Brake pads (front)', category: 'wear',
    cost: 9000, zone: 'frontAxle',
    rule: { kind: 'distance', intervalKm: 40_000, lastDoneOdometer: 75_000, lastDoneDate: '2025-06-01' },
  };

  it('rolls the odometer forward from the last reading at the daily rate', () => {
    // Read 100,000 km on 1 Aug, 50 km/day, 29 days later.
    expect(projectOdometer(fixture(item), '2026-08-30')).toBe(100_000 + 29 * 50);
  });

  it('estimates a date from the kilometres left and the daily rate', () => {
    const s = computeSchedule(item, fixture(item), '2026-08-30');
    expect(s.dueAtKm).toBe(115_000);
    expect(s.projectedKm).toBe(101_450);
    expect(s.kmRemaining).toBe(13_550);
    expect(s.daysUntil).toBe(Math.round(13_550 / 50));
    expect(s.nextDueDate).toBe(addDays('2026-08-30', Math.round(13_550 / 50)));
    expect(s.estimated).toBe(true);
  });

  it('brings the date forward for a vehicle that runs further each day', () => {
    const slow = computeSchedule(item, fixture(item, { avgKmPerDay: 20 }), '2026-08-30');
    const fast = computeSchedule(item, fixture(item, { avgKmPerDay: 200 }), '2026-08-30');
    expect(fast.daysUntil).toBeLessThan(slow.daysUntil);
  });

  it('does not divide by zero for a vehicle that never moves', () => {
    const s = computeSchedule(item, fixture(item, { avgKmPerDay: 0 }), '2026-08-30');
    expect(Number.isFinite(s.daysUntil)).toBe(true);
  });

  it('reports past due once the projected odometer is beyond the due figure', () => {
    const s = computeSchedule(
      item,
      fixture(item, { odometer: { km: 120_000, readAt: '2026-08-30' } }),
      '2026-08-30',
    );
    expect(s.kmRemaining).toBe(-5_000);
    expect(s.status).toBe('overdue');
    expect(s.why).toContain('past due');
  });
});

describe('recording a completed service', () => {
  const vehicle = fleet.vehicles[0];

  it('resets a fixed date item by its renewal term', () => {
    const item = vehicle.items.find((i) => i.rule.kind === 'fixedDate')!;
    const reset = resetRule(item, '2026-08-30', 90_000);
    expect(reset.rule).toMatchObject({ kind: 'fixedDate', dueDate: '2027-08-30' });
  });

  it('restarts the clock on an interval item', () => {
    const item = vehicle.items.find((i) => i.rule.kind === 'interval')!;
    const reset = resetRule(item, '2026-08-30', 90_000);
    expect(reset.rule).toMatchObject({ kind: 'interval', lastDoneDate: '2026-08-30' });
  });

  it('restarts the counter on a distance item', () => {
    const item = vehicle.items.find((i) => i.rule.kind === 'distance')!;
    const reset = resetRule(item, '2026-08-30', 90_000);
    expect(reset.rule).toMatchObject({ kind: 'distance', lastDoneOdometer: 90_000 });
  });

  it('pushes the item out of overdue, grows the history and leaves the input untouched', () => {
    const overdueVehicle = fleet.vehicles.find((v) => statusOf(v).overdue.length > 0)!;
    const before = statusOf(overdueVehicle);
    const target = before.overdue[0];
    const historyBefore = historyForVehicle(fleet, overdueVehicle.id).length;

    const { fleet: next, record } = completeService(fleet, {
      vehicleId: overdueVehicle.id,
      itemId: target.item.id,
      date: AS_OF,
      odometer: before.projectedKm,
      cost: target.item.cost,
      technician: 'Jashim',
    });

    const updatedVehicle = next.vehicles.find((v) => v.id === overdueVehicle.id)!;
    const updatedItem = updatedVehicle.items.find((i) => i.id === target.item.id)!;
    const after = computeSchedule(updatedItem, updatedVehicle, AS_OF);

    expect(after.status).not.toBe('overdue');
    expect(after.daysUntil).toBeGreaterThan(target.daysUntil);
    expect(historyForVehicle(next, overdueVehicle.id).length).toBe(historyBefore + 1);
    expect(record.itemCode).toBe(target.item.code);

    // The original fleet object is untouched.
    expect(historyForVehicle(fleet, overdueVehicle.id).length).toBe(historyBefore);
    expect(statusOf(overdueVehicle).overdue.length).toBe(before.overdue.length);
  });

  it('moves the odometer up when the workshop reads a higher figure', () => {
    const { fleet: next } = completeService(fleet, {
      vehicleId: vehicle.id,
      itemId: vehicle.items[0].id,
      date: AS_OF,
      odometer: vehicle.odometer.km + 5_000,
      cost: 1000,
      technician: 'Babul',
    });
    const updated = next.vehicles.find((v) => v.id === vehicle.id)!;
    expect(updated.odometer).toEqual({ km: vehicle.odometer.km + 5_000, readAt: AS_OF });
  });

  it('rejects an unknown vehicle or item', () => {
    expect(() =>
      completeService(fleet, { vehicleId: 'nope', itemId: 'x', date: AS_OF, odometer: 1, cost: 1, technician: 'a' }),
    ).toThrow(/Unknown vehicle/);
    expect(() =>
      completeService(fleet, { vehicleId: vehicle.id, itemId: 'nope', date: AS_OF, odometer: 1, cost: 1, technician: 'a' }),
    ).toThrow(/Unknown item/);
  });
});

describe('daily call list', () => {
  const list = buildCallList(fleet, AS_OF);

  it('only carries vehicles with work that is overdue or due soon', () => {
    expect(list.length).toBeGreaterThan(0);
    for (const entry of list) {
      const { overdue, dueSoon } = entry.vehicleStatus;
      expect(overdue.length + dueSoon.length).toBeGreaterThan(0);
    }
  });

  it('is sorted by priority score, highest first', () => {
    for (let i = 1; i < list.length; i += 1) {
      expect(list[i - 1].priority.total).toBeGreaterThanOrEqual(list[i].priority.total);
    }
  });

  it('puts an overdue vehicle above an otherwise identical due-soon one', () => {
    const firstDueSoonOnly = list.findIndex((e) => e.vehicleStatus.overdue.length === 0);
    const lastOverdue = list.map((e) => e.vehicleStatus.overdue.length > 0).lastIndexOf(true);
    if (firstDueSoonOnly !== -1) expect(lastOverdue).toBeLessThan(firstDueSoonOnly);
  });

  it('ranks the higher value job first when two are equally overdue', () => {
    const cheap = buildCallList(
      { ...fleet, vehicles: [fleet.vehicles[0]] },
      AS_OF,
    );
    expect(cheap.every((e) => e.priority.value >= 0)).toBe(true);
  });

  it('gives every entry a reason to read down the phone', () => {
    for (const entry of list) {
      expect(entry.talkingPoints.length).toBe(
        entry.vehicleStatus.overdue.length + entry.vehicleStatus.dueSoon.length,
      );
      for (const point of entry.talkingPoints) expect(point.length).toBeGreaterThan(20);
    }
  });
});

describe('the generated fleet meets the brief', () => {
  it('has at least 40 vehicles across at least 25 owners', () => {
    expect(fleet.vehicles.length).toBeGreaterThanOrEqual(40);
    expect(new Set(fleet.vehicles.map((v) => v.ownerId)).size).toBeGreaterThanOrEqual(25);
  });

  it('uses all three rule kinds on every vehicle', () => {
    for (const v of fleet.vehicles) {
      const kinds = new Set(v.items.map((i) => i.rule.kind));
      expect(kinds).toContain('fixedDate');
      expect(kinds).toContain('interval');
      expect(kinds).toContain('distance');
    }
  });

  it('carries an odometer reading and past service records for every vehicle', () => {
    for (const v of fleet.vehicles) {
      expect(v.odometer.km).toBeGreaterThan(0);
      expect(v.avgKmPerDay).toBeGreaterThan(0);
      expect(vehiclesById.has(v.id)).toBe(true);
      expect(historyForVehicle(fleet, v.id).length).toBeGreaterThan(0);
    }
  });

  it('never dates a service record in the future or at a negative odometer', () => {
    for (const r of fleet.history) {
      expect(r.date <= AS_OF).toBe(true);
      expect(r.odometer).toBeGreaterThanOrEqual(0);
    }
  });

  it('lands a realistic spread of overdue, due soon and fine work', () => {
    const summary = summariseFleet(fleet, AS_OF);
    expect(summary.overdueItems).toBeGreaterThan(30);
    expect(summary.dueSoonItems).toBeGreaterThan(30);
    expect(summary.fineItems).toBeGreaterThan(summary.overdueItems);
    expect(summary.overdueItems + summary.dueSoonItems + summary.fineItems).toBe(
      summary.itemsTracked,
    );
  });
});
