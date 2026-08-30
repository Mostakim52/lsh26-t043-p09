import { daysBetween } from "../engine/dates.js";
import { BODY_TYPE_BY_MODEL, ITEM_CATALOGUE, deriveColour, deriveOwnerArea, deriveOwnerSince, deriveTechnician, deriveYear } from "./catalogue.js";
import type { FixtureCase, FixtureVehicle } from "./fixture.js";

export class FixtureValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FixtureValidationError";
  }
}

export interface NormalizedItem {
  code: string;
  label: string;
  category: string;
  zone: string;
  cost: number;
  ruleKind: "fixedDate" | "interval" | "distance";
  dueDate?: string;
  renewalMonths?: number;
  months?: number;
  lastDoneDate?: string;
  intervalKm?: number;
  lastDoneOdometer?: number;
}

export interface NormalizedVehicle {
  extId: string;
  ownerExtId: string;
  make: string;
  model: string;
  year: number;
  plate: string;
  colour: string;
  bodyType: string;
  odometerKm: number;
  odometerReadAt: string;
  avgKmPerDay: number;
  items: NormalizedItem[];
}

export interface NormalizedOwner {
  extId: string;
  name: string;
  phone: string;
  area: string;
  since: string;
}

export interface NormalizedRecord {
  vehicleExtId: string;
  itemCode: string;
  label: string;
  date: string;
  odometer: number;
  cost: number;
  technician: string;
}

export interface NormalizedCase {
  caseId: string;
  today: string;
  owners: NormalizedOwner[];
  vehicles: NormalizedVehicle[];
  records: NormalizedRecord[];
}

function parseBdt(raw: string): number {
  const n = Math.round(Number.parseFloat(raw));
  if (!Number.isFinite(n)) throw new FixtureValidationError(`unparseable currency value "${raw}"`);
  return n;
}

function splitMakeModel(raw: string): { make: string; model: string } {
  const [make, ...rest] = raw.split(" ");
  return { make: make ?? raw, model: rest.join(" ") || raw };
}

function deriveAvgKmPerDay(readings: FixtureVehicle["odometer_readings"]): number {
  const sorted = [...readings].sort((a, b) => a.date.localeCompare(b.date));
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  const elapsed = daysBetween(first.date, last.date);
  if (elapsed <= 0) return 1;
  return Math.max(1, Math.round((last.km - first.km) / elapsed));
}

function normalizeVehicle(raw: FixtureVehicle): { vehicle: NormalizedVehicle; records: NormalizedRecord[] } {
  const where = `vehicle ${raw.id}`;
  const { make, model } = splitMakeModel(raw.model);
  const bodyType = BODY_TYPE_BY_MODEL[raw.model];
  if (!bodyType) throw new FixtureValidationError(`${where}: unknown model "${raw.model}", no bodyType mapping`);

  const sortedReadings = [...raw.odometer_readings].sort((a, b) => a.date.localeCompare(b.date));
  const latest = sortedReadings[sortedReadings.length - 1]!;

  const items: NormalizedItem[] = raw.service_items.map((si) => {
    const catalogue = ITEM_CATALOGUE[si.name];
    if (!catalogue) throw new FixtureValidationError(`${where}: unknown item "${si.name}", no catalogue entry`);
    const cost = parseBdt(si.cost_bdt);

    if (si.rule === "fixed_date") {
      if (catalogue.renewalMonths === undefined) {
        throw new FixtureValidationError(`${where}/${si.name}: fixed_date item has no renewalMonths in the catalogue`);
      }
      return { code: catalogue.code, label: si.name, category: catalogue.category, zone: catalogue.zone, cost, ruleKind: "fixedDate", dueDate: si.due_date, renewalMonths: catalogue.renewalMonths };
    }

    const history = raw.service_history.filter((h) => h.item === si.name).sort((a, b) => b.date.localeCompare(a.date));
    const mostRecent = history[0];
    if (!mostRecent) throw new FixtureValidationError(`${where}/${si.name}: no service history to derive lastDoneDate from`);

    if (si.rule === "period_months") {
      return { code: catalogue.code, label: si.name, category: catalogue.category, zone: catalogue.zone, cost, ruleKind: "interval", months: si.every_months, lastDoneDate: mostRecent.date };
    }

    // distance_km
    if (mostRecent.km === null) throw new FixtureValidationError(`${where}/${si.name}: most recent distance-item history has no km`);
    return { code: catalogue.code, label: si.name, category: catalogue.category, zone: catalogue.zone, cost, ruleKind: "distance", intervalKm: si.every_km, lastDoneDate: mostRecent.date, lastDoneOdometer: mostRecent.km };
  });

  const codes = new Set(items.map((i) => i.code));
  if (codes.size !== items.length) throw new FixtureValidationError(`${where}: duplicate item code after catalogue mapping`);

  const records: NormalizedRecord[] = raw.service_history.map((h, idx) => {
    const catalogue = ITEM_CATALOGUE[h.item];
    if (!catalogue) throw new FixtureValidationError(`${where}: unknown history item "${h.item}"`);
    // Distance-rule history always carries km; other rules record against the
    // nearest known reading rather than null, so every stored record has a
    // real odometer value.
    const odometer = h.km ?? estimateOdometerAt(sortedReadings, h.date);
    return {
      vehicleExtId: raw.id,
      itemCode: catalogue.code,
      label: h.item,
      date: h.date,
      odometer,
      cost: parseBdt(h.cost_bdt),
      technician: deriveTechnicianFor(raw.id, h.item, h.date, idx),
    };
  });

  return {
    vehicle: {
      extId: raw.id,
      ownerExtId: raw.owner_id,
      make,
      model,
      year: deriveYear(raw.id),
      plate: raw.plate,
      colour: deriveColour(raw.id),
      bodyType,
      odometerKm: latest.km,
      odometerReadAt: latest.date,
      avgKmPerDay: deriveAvgKmPerDay(raw.odometer_readings),
      items,
    },
    records,
  };
}

/** Linear-interpolate (or extrapolate at the known rate) an odometer value for a
 *  historical date that has no recorded km - only used for interval-rule history
 *  entries, which the source data legitimately leaves null. */
function estimateOdometerAt(sortedReadings: FixtureVehicle["odometer_readings"], date: string): number {
  const before = [...sortedReadings].reverse().find((r) => r.date <= date);
  const after = sortedReadings.find((r) => r.date >= date);
  if (before && after && before.date !== after.date) {
    const span = daysBetween(before.date, after.date);
    const frac = span > 0 ? daysBetween(before.date, date) / span : 0;
    return Math.round(before.km + (after.km - before.km) * frac);
  }
  const anchor = before ?? after ?? sortedReadings[0]!;
  return anchor.km;
}

function deriveTechnicianFor(vehicleId: string, item: string, date: string, idx: number): string {
  return deriveTechnician(`${vehicleId}:${item}:${date}:${idx}`);
}

export function normalizeCase(raw: FixtureCase): NormalizedCase {
  const ownerIds = new Set(raw.owners.map((o) => o.id));
  for (const v of raw.vehicles) {
    if (!ownerIds.has(v.owner_id)) throw new FixtureValidationError(`vehicle ${v.id}: unknown owner_id "${v.owner_id}"`);
  }

  const owners: NormalizedOwner[] = raw.owners.map((o) => ({
    extId: o.id,
    name: o.name,
    phone: o.phone,
    area: deriveOwnerArea(o.id),
    since: deriveOwnerSince(o.id, raw.today),
  }));

  const vehicles: NormalizedVehicle[] = [];
  const records: NormalizedRecord[] = [];
  for (const rawVehicle of raw.vehicles) {
    const { vehicle, records: vRecords } = normalizeVehicle(rawVehicle);
    vehicles.push(vehicle);
    records.push(...vRecords);
  }

  return { caseId: raw.case_id, today: raw.today, owners, vehicles, records };
}
