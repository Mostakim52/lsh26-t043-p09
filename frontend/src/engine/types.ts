/** An ISO calendar date, `YYYY-MM-DD`. All dates in the system are date-only. */
export type IsoDate = string;

/**
 * The three ways a service item can fall due. Each item carries exactly one rule,
 * and each rule kind is projected forward differently (see schedule.ts).
 */
export type ServiceRule =
  /**
   * Insurance, fitness, tax token: a date printed on a document. `renewalMonths` is
   * the term the document is issued for, used to push the date forward when the
   * workshop records a renewal.
   */
  | { kind: 'fixedDate'; dueDate: IsoDate; renewalMonths: number }
  /** Engine oil, coolant, AC service: a period of time since it was last done. */
  | { kind: 'interval'; months: number; lastDoneDate: IsoDate }
  /** Brake pads, tyres, timing belt: a distance since it was last done. */
  | { kind: 'distance'; intervalKm: number; lastDoneOdometer: number; lastDoneDate: IsoDate };

export type RuleKind = ServiceRule['kind'];

/** Where on the car an item sits. Drives the hotspots on the 3D model. */
export type CarZone = 'engine' | 'frontAxle' | 'rearAxle' | 'cabin' | 'body' | 'underbody';

export type ItemCategory = 'legal' | 'maintenance' | 'wear';

export interface ServiceItem {
  id: string;
  /** Stable code shared with the backend, e.g. ENGINE_OIL. */
  code: string;
  label: string;
  category: ItemCategory;
  rule: ServiceRule;
  /** Quoted price of the work in BDT. */
  cost: number;
  zone: CarZone;
}

export interface OdometerReading {
  km: number;
  /** When the workshop last saw this reading. Distance projections run from here. */
  readAt: IsoDate;
}

export interface Vehicle {
  id: string;
  ownerId: string;
  make: string;
  model: string;
  year: number;
  /** Bangladeshi registration, e.g. "DHAKA METRO-GA 15-2847". */
  plate: string;
  /** Paint colour as a hex string; the 3D model reads this. */
  colour: string;
  bodyType: 'sedan' | 'hatchback' | 'suv' | 'mpv';
  odometer: OdometerReading;
  /** How far this vehicle runs per day, from its own reading history. */
  avgKmPerDay: number;
  items: ServiceItem[];
}

export interface Owner {
  id: string;
  name: string;
  phone: string;
  area: string;
  /** Customer since. */
  since: IsoDate;
}

export interface ServiceRecord {
  id: string;
  vehicleId: string;
  itemCode: string;
  label: string;
  date: IsoDate;
  /** Odometer at the time the work was done. */
  odometer: number;
  cost: number;
  technician: string;
  notes?: string;
}

export interface Fleet {
  meta: {
    workshop: string;
    city: string;
    currency: string;
    generatedAt: IsoDate;
    seed?: number;
  };
  owners: Owner[];
  vehicles: Vehicle[];
  history: ServiceRecord[];
}

/* ----------------------------------------------------------------- computed -- */

export type DueStatus = 'overdue' | 'dueSoon' | 'fine';

export interface ItemSchedule {
  item: ServiceItem;
  vehicleId: string;
  /** The date this item falls due; for distance items this is an estimate. */
  nextDueDate: IsoDate;
  /** Negative when overdue. Whole days. */
  daysUntil: number;
  status: DueStatus;
  /** Plain-language reason the workshop can read down the phone. */
  why: string;
  /** True when nextDueDate was projected from running distance rather than read off a rule. */
  estimated: boolean;
  /** Distance rules only. */
  dueAtKm?: number;
  kmRemaining?: number;
  projectedKm?: number;
}

export interface VehicleStatus {
  vehicle: Vehicle;
  owner: Owner;
  schedules: ItemSchedule[];
  overdue: ItemSchedule[];
  dueSoon: ItemSchedule[];
  fine: ItemSchedule[];
  /** Worst status across every item on the vehicle. */
  worst: DueStatus;
  /** Days past due on the most overdue item, 0 when nothing is overdue. */
  worstDaysOverdue: number;
  /** Value of the work that is overdue or due soon. */
  dueValue: number;
  /** Projected odometer today, from the last reading plus daily running. */
  projectedKm: number;
}

export interface PriorityBreakdown {
  urgency: number;
  imminence: number;
  value: number;
  total: number;
}

export interface CallListEntry {
  vehicleStatus: VehicleStatus;
  priority: PriorityBreakdown;
  /** One line per due item: what to say and why. */
  talkingPoints: string[];
}
