/**
 * Builds frontend/public/data/fleet.json.
 *
 * Deterministic: a seeded PRNG drives everything, so re-running reproduces the same
 * file byte for byte. Statuses are back-solved rather than left to chance — the script
 * picks whether an item should be overdue, due soon or fine, then works out the rule
 * parameters that land it there, so the demo always has a realistic spread of work.
 *
 *   node scripts/generate-fleet.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '../public/data/fleet.json');

const SEED = 20260830;
/** Everything is generated relative to this date. */
const ANCHOR = '2026-08-30';

/* ------------------------------------------------------------------ prng -- */

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(SEED);
const between = (lo, hi) => lo + rand() * (hi - lo);
const intBetween = (lo, hi) => Math.floor(between(lo, hi + 1));
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const chance = (p) => rand() < p;

function shuffle(arr) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    const t = out[i];
    out[i] = out[j];
    out[j] = t;
  }
  return out;
}

/* ------------------------------------------------------------------ dates -- */

const DAY = 86_400_000;
const parseIso = (d) => {
  const [y, m, dd] = d.split('-').map(Number);
  return Date.UTC(y, m - 1, dd);
};
const toIso = (stamp) => new Date(stamp).toISOString().slice(0, 10);
const addDays = (d, n) => toIso(parseIso(d) + Math.round(n) * DAY);

function addMonths(date, months) {
  const [y, m, d] = date.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  return toIso(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(d, last)));
}

/* -------------------------------------------------------------- catalogue -- */

// cost is a range; the generator picks inside it per vehicle.
const CATALOGUE = [
  // Fixed date — the renewal term is what a completed renewal pushes the date on by.
  { code: 'INSURANCE', label: 'Insurance renewal', category: 'legal', kind: 'fixedDate', renewalMonths: 12, cost: [16000, 34000], zone: 'body', always: true },
  { code: 'FITNESS', label: 'Fitness certificate', category: 'legal', kind: 'fixedDate', renewalMonths: 12, cost: [4500, 7000], zone: 'body', always: true },
  { code: 'TAX_TOKEN', label: 'Tax token', category: 'legal', kind: 'fixedDate', renewalMonths: 12, cost: [11000, 26000], zone: 'body', always: true },

  // Time interval.
  { code: 'ENGINE_OIL', label: 'Engine oil & filter', category: 'maintenance', kind: 'interval', months: 6, cost: [3500, 6800], zone: 'engine', always: true },
  { code: 'AC_SERVICE', label: 'Air conditioning service', category: 'maintenance', kind: 'interval', months: 12, cost: [3800, 6000], zone: 'cabin' },
  { code: 'BATTERY', label: 'Battery check & terminals', category: 'maintenance', kind: 'interval', months: 12, cost: [1500, 2600], zone: 'engine' },
  { code: 'COOLANT', label: 'Coolant flush', category: 'maintenance', kind: 'interval', months: 24, cost: [2800, 4200], zone: 'engine' },
  { code: 'CABIN_FILTER', label: 'Cabin air filter', category: 'maintenance', kind: 'interval', months: 12, cost: [1200, 2200], zone: 'cabin' },

  // Distance.
  { code: 'BRAKE_PADS', label: 'Brake pads (front)', category: 'wear', kind: 'distance', intervalKm: 40000, cost: [7500, 15000], zone: 'frontAxle', always: true },
  { code: 'TYRES', label: 'Tyre replacement (set of 4)', category: 'wear', kind: 'distance', intervalKm: 50000, cost: [30000, 62000], zone: 'rearAxle', always: true },
  { code: 'BRAKE_DISCS', label: 'Brake discs', category: 'wear', kind: 'distance', intervalKm: 80000, cost: [14000, 24000], zone: 'frontAxle' },
  { code: 'TIMING_BELT', label: 'Timing belt', category: 'wear', kind: 'distance', intervalKm: 100000, cost: [18000, 30000], zone: 'engine' },
  { code: 'SPARK_PLUGS', label: 'Spark plugs', category: 'wear', kind: 'distance', intervalKm: 40000, cost: [3200, 6000], zone: 'engine' },
  { code: 'TRANSMISSION', label: 'Transmission fluid', category: 'wear', kind: 'distance', intervalKm: 60000, cost: [7500, 12000], zone: 'underbody' },
  { code: 'ALIGNMENT', label: 'Wheel alignment & balancing', category: 'wear', kind: 'distance', intervalKm: 10000, cost: [1800, 3200], zone: 'frontAxle' },
  { code: 'AIR_FILTER', label: 'Engine air filter', category: 'wear', kind: 'distance', intervalKm: 20000, cost: [1600, 2800], zone: 'engine' },
  { code: 'SUSPENSION', label: 'Suspension inspection', category: 'wear', kind: 'distance', intervalKm: 30000, cost: [5000, 8500], zone: 'underbody' },
];

const MODELS = [
  { make: 'Toyota', model: 'Corolla Axio', bodyType: 'sedan', years: [2014, 2021], rate: [28, 62] },
  { make: 'Toyota', model: 'Premio', bodyType: 'sedan', years: [2013, 2020], rate: [25, 58] },
  { make: 'Toyota', model: 'Allion', bodyType: 'sedan', years: [2013, 2019], rate: [26, 60] },
  { make: 'Toyota', model: 'Prius', bodyType: 'hatchback', years: [2015, 2022], rate: [70, 145] },
  { make: 'Toyota', model: 'Noah', bodyType: 'mpv', years: [2014, 2021], rate: [55, 120] },
  { make: 'Toyota', model: 'Harrier', bodyType: 'suv', years: [2016, 2022], rate: [24, 55] },
  { make: 'Honda', model: 'Civic', bodyType: 'sedan', years: [2015, 2022], rate: [30, 65] },
  { make: 'Honda', model: 'Vezel', bodyType: 'suv', years: [2016, 2022], rate: [32, 70] },
  { make: 'Honda', model: 'Grace', bodyType: 'sedan', years: [2015, 2020], rate: [60, 130] },
  { make: 'Nissan', model: 'X-Trail', bodyType: 'suv', years: [2015, 2021], rate: [26, 58] },
  { make: 'Nissan', model: 'Sunny', bodyType: 'sedan', years: [2013, 2019], rate: [40, 95] },
  { make: 'Mitsubishi', model: 'Pajero Sport', bodyType: 'suv', years: [2014, 2021], rate: [22, 52] },
  { make: 'Suzuki', model: 'Swift', bodyType: 'hatchback', years: [2016, 2022], rate: [30, 70] },
  { make: 'Hyundai', model: 'Tucson', bodyType: 'suv', years: [2017, 2023], rate: [24, 56] },
  { make: 'Kia', model: 'Sportage', bodyType: 'suv', years: [2017, 2022], rate: [25, 58] },
  { make: 'BMW', model: '320i', bodyType: 'sedan', years: [2016, 2022], rate: [18, 45] },
  { make: 'Mercedes-Benz', model: 'C200', bodyType: 'sedan', years: [2016, 2022], rate: [16, 42] },
  { make: 'Toyota', model: 'Hiace', bodyType: 'mpv', years: [2013, 2020], rate: [80, 160] },
];

const COLOURS = [
  '#E9EAEC', '#B6BABF', '#4B515A', '#1A1C21', '#1D3D70',
  '#A32E24', '#6D5B44', '#22402F', '#2E6B75', '#8C8F94',
];

const GIVEN = [
  'Rafiqul', 'Shahidul', 'Nasrin', 'Kamrul', 'Farhana', 'Mizanur', 'Sabina', 'Tanvir',
  'Rubel', 'Nusrat', 'Jahangir', 'Salma', 'Anisur', 'Rehana', 'Mahbub', 'Shirin',
  'Golam', 'Ferdous', 'Ashraful', 'Rokeya', 'Delwar', 'Sultana', 'Habibur', 'Momtaz',
  'Iqbal', 'Ayesha', 'Zakir', 'Nazma', 'Shafiqul', 'Rumana', 'Bashir', 'Taslima',
];
const FAMILY = [
  'Islam', 'Hossain', 'Rahman', 'Ahmed', 'Chowdhury', 'Akter', 'Khatun', 'Begum',
  'Sarker', 'Bhuiyan', 'Talukder', 'Haque', 'Karim', 'Uddin', 'Alam', 'Mia',
];
const AREAS = [
  'Dhanmondi', 'Gulshan', 'Banani', 'Uttara', 'Mirpur', 'Mohammadpur', 'Bashundhara',
  'Baridhara', 'Motijheel', 'Tejgaon', 'Badda', 'Khilgaon', 'Rampura', 'Shyamoli',
  'Lalmatia', 'Wari', 'Jatrabari', 'Savar',
];
const PLATE_SERIES = ['GA', 'GHA', 'KA', 'KHA', 'CHA', 'JA', 'HA', 'LA', 'TA', 'DA'];
const TECHNICIANS = ['Jashim', 'Babul', 'Ripon', 'Sohel', 'Alamgir', 'Nayan', 'Faruk', 'Shamim'];

/* ------------------------------------------------------- status targeting -- */

// How the fleet should look on the anchor date.
const STATUS_MIX = [
  ...Array(18).fill('overdue'),
  ...Array(22).fill('dueSoon'),
  ...Array(60).fill('fine'),
];

/** Days-until value that produces the wanted status. */
function targetDaysUntil(status) {
  if (status === 'overdue') return -intBetween(1, 165);
  if (status === 'dueSoon') return intBetween(0, 30);
  return intBetween(31, 420);
}

/* ------------------------------------------------------------- generation -- */

const OWNER_COUNT = 28;
const VEHICLE_COUNT = 44;

const usedNames = new Set();
function freshName() {
  for (let i = 0; i < 400; i += 1) {
    const name = `${pick(GIVEN)} ${pick(FAMILY)}`;
    if (!usedNames.has(name)) {
      usedNames.add(name);
      return name;
    }
  }
  throw new Error('ran out of names');
}

const owners = Array.from({ length: OWNER_COUNT }, (_, i) => ({
  id: `OWN-${String(i + 1).padStart(3, '0')}`,
  name: freshName(),
  phone: `01${intBetween(3, 9)}${String(intBetween(10_000_000, 99_999_999))}`,
  area: pick(AREAS),
  since: addDays(ANCHOR, -intBetween(200, 2600)),
}));

// Spread vehicles over owners: everyone gets one, then the remainder goes to a few
// owners who run more than one car — which is what a real workshop book looks like.
const ownerForVehicle = [];
owners.forEach((o) => ownerForVehicle.push(o.id));
while (ownerForVehicle.length < VEHICLE_COUNT) {
  ownerForVehicle.push(owners[intBetween(0, Math.floor(OWNER_COUNT / 2))].id);
}

const usedPlates = new Set();
function freshPlate() {
  for (let i = 0; i < 400; i += 1) {
    const plate = `DHAKA METRO-${pick(PLATE_SERIES)} ${intBetween(11, 39)}-${intBetween(1000, 9999)}`;
    if (!usedPlates.has(plate)) {
      usedPlates.add(plate);
      return plate;
    }
  }
  throw new Error('ran out of plates');
}

const vehicles = [];
const history = [];

shuffle(ownerForVehicle).forEach((ownerId, index) => {
  const spec = pick(MODELS);
  const id = `VEH-${String(index + 1).padStart(3, '0')}`;
  const year = intBetween(spec.years[0], spec.years[1]);
  const avgKmPerDay = Math.round(between(spec.rate[0], spec.rate[1]));

  // Odometer was last read somewhere in the past few weeks, so today's figure has to
  // be projected forward — which is exactly what the engine does.
  const readAt = addDays(ANCHOR, -intBetween(2, 45));
  const ageDays = (2026 - year) * 365 + intBetween(0, 300);
  const km = Math.max(8000, Math.round(ageDays * avgKmPerDay * between(0.75, 1.05)));
  const daysSinceRead = Math.round((parseIso(ANCHOR) - parseIso(readAt)) / DAY);
  const projectedKm = km + daysSinceRead * avgKmPerDay;

  // Every vehicle carries the always-on items plus a sample of the rest.
  const optional = shuffle(CATALOGUE.filter((c) => !c.always)).slice(0, intBetween(4, 6));
  const chosen = [...CATALOGUE.filter((c) => c.always), ...optional];

  const items = chosen.map((tpl) => {
    const cost = Math.round(between(tpl.cost[0], tpl.cost[1]) / 100) * 100;
    const status = pick(STATUS_MIX);
    const days = targetDaysUntil(status);
    const base = { id: `${id}-${tpl.code}`, code: tpl.code, label: tpl.label, category: tpl.category, cost, zone: tpl.zone };

    if (tpl.kind === 'fixedDate') {
      return {
        ...base,
        rule: { kind: 'fixedDate', dueDate: addDays(ANCHOR, days), renewalMonths: tpl.renewalMonths },
      };
    }

    if (tpl.kind === 'interval') {
      const nextDue = addDays(ANCHOR, days);
      return {
        ...base,
        rule: { kind: 'interval', months: tpl.months, lastDoneDate: addMonths(nextDue, -tpl.months) },
      };
    }

    // Distance: solve backwards from the wanted number of days.
    const kmRemaining = days * avgKmPerDay;
    const dueAtKm = projectedKm + kmRemaining;
    let lastDoneOdometer = Math.round(dueAtKm - tpl.intervalKm);
    // A brand-new part cannot have been fitted at a negative odometer reading.
    if (lastDoneOdometer < 0) lastDoneOdometer = intBetween(0, 2000);
    const kmSinceDone = Math.max(0, projectedKm - lastDoneOdometer);
    const lastDoneDate = addDays(ANCHOR, -Math.round(kmSinceDone / avgKmPerDay));

    return {
      ...base,
      rule: {
        kind: 'distance',
        intervalKm: tpl.intervalKm,
        lastDoneOdometer,
        lastDoneDate,
      },
    };
  });

  vehicles.push({
    id,
    ownerId,
    make: spec.make,
    model: spec.model,
    year,
    plate: freshPlate(),
    colour: pick(COLOURS),
    bodyType: spec.bodyType,
    odometer: { km, readAt },
    avgKmPerDay,
    items,
  });

  // Service history. Each interval and distance item gets the record that put it where
  // it is, so the history and the rules tell the same story. Then a few older jobs.
  const records = [];
  for (const item of items) {
    if (item.rule.kind === 'interval') {
      records.push({
        date: item.rule.lastDoneDate,
        odometer: Math.max(0, km - Math.round(
          ((parseIso(ANCHOR) - parseIso(item.rule.lastDoneDate)) / DAY) * avgKmPerDay,
        )),
        item,
      });
    } else if (item.rule.kind === 'distance') {
      records.push({ date: item.rule.lastDoneDate, odometer: item.rule.lastDoneOdometer, item });
    } else if (chance(0.5)) {
      const renewedOn = addMonths(item.rule.dueDate, -item.rule.renewalMonths);
      records.push({
        date: renewedOn,
        odometer: Math.max(0, km - Math.round(
          ((parseIso(ANCHOR) - parseIso(renewedOn)) / DAY) * avgKmPerDay,
        )),
        item,
      });
    }
  }

  for (const r of records) {
    if (parseIso(r.date) > parseIso(ANCHOR)) continue;
    history.push({
      id: `SRV-${id}-${r.item.code}-${r.date}`,
      vehicleId: id,
      itemCode: r.item.code,
      label: r.item.label,
      date: r.date,
      odometer: Math.max(0, Math.round(r.odometer)),
      cost: Math.round((r.item.cost * between(0.85, 1.1)) / 100) * 100,
      technician: pick(TECHNICIANS),
      ...(chance(0.25) ? { notes: pick([
        'Customer reported noise on braking.',
        'Parts sourced from Bangla Motor.',
        'Advised to return in a month for a re-check.',
        'Genuine parts used at customer request.',
        'Minor leak sealed at no extra charge.',
      ]) } : {}),
    });
  }
});

history.sort((a, b) => b.date.localeCompare(a.date));

const fleet = {
  meta: {
    workshop: 'Shahjalal Auto Care',
    city: 'Dhaka',
    currency: 'BDT',
    generatedAt: ANCHOR,
    seed: SEED,
  },
  owners,
  vehicles,
  history,
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(fleet, null, 2)}\n`, 'utf8');

const itemCount = vehicles.reduce((n, v) => n + v.items.length, 0);
console.log(
  `wrote ${owners.length} owners, ${vehicles.length} vehicles, ${itemCount} items, ` +
  `${history.length} service records to ${OUT}`,
);
