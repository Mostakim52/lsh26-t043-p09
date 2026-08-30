/**
 * The official dataset gives each service item only a `name` + rule fields -
 * no `code`, `category`, `zone`, or (for fixedDate items) `renewalMonths`.
 * These are the frontend's own fields (see CLAUDE.md §3.3, §9.1) needed to
 * drive the 3D model hotspots and the completion-reset formula. Enumerated
 * by surveying every item name actually used across all 25 public cases
 * (exactly 12, a closed set) - see the survey this was built from.
 *
 * renewalMonths is a genuine assumption the source data doesn't provide:
 * annual (12mo) for the three standard Bangladeshi vehicle documents,
 * 24 months for a battery warranty (typical warranty term, not a legal
 * renewal cycle like the other three). Documented here and in the README.
 */
export interface CatalogueEntry {
  code: string;
  category: "legal" | "maintenance" | "wear";
  zone: "engine" | "frontAxle" | "rearAxle" | "cabin" | "body" | "underbody";
  /** fixedDate items only - how many months a renewal is issued for. */
  renewalMonths?: number;
}

export const ITEM_CATALOGUE: Record<string, CatalogueEntry> = {
  Insurance: { code: "INSURANCE", category: "legal", zone: "body", renewalMonths: 12 },
  "Fitness certificate": { code: "FITNESS_CERTIFICATE", category: "legal", zone: "body", renewalMonths: 12 },
  "Tax token": { code: "TAX_TOKEN", category: "legal", zone: "body", renewalMonths: 12 },
  "Battery warranty": { code: "BATTERY_WARRANTY", category: "maintenance", zone: "engine", renewalMonths: 24 },
  "Engine oil": { code: "ENGINE_OIL", category: "maintenance", zone: "engine" },
  "Air filter": { code: "AIR_FILTER", category: "maintenance", zone: "engine" },
  Coolant: { code: "COOLANT", category: "maintenance", zone: "engine" },
  "AC service": { code: "AC_SERVICE", category: "maintenance", zone: "cabin" },
  "Brake pads": { code: "BRAKE_PADS", category: "wear", zone: "frontAxle" },
  "Spark plugs": { code: "SPARK_PLUGS", category: "wear", zone: "engine" },
  "Timing belt": { code: "TIMING_BELT", category: "wear", zone: "engine" },
  Tyres: { code: "TYRES", category: "wear", zone: "underbody" },
};

/**
 * Vehicle body shape for the 3D model - not in the source data. Derived from
 * real-world knowledge of these specific models (a closed set of 10 makes/
 * models across the whole public dataset), not an arbitrary guess.
 */
export const BODY_TYPE_BY_MODEL: Record<string, "sedan" | "hatchback" | "suv" | "mpv"> = {
  "Suzuki Alto": "hatchback",
  "Toyota Axio": "sedan",
  "Toyota Allion": "sedan",
  "Toyota Premio": "sedan",
  "Honda Grace": "sedan",
  "Honda Vezel": "suv",
  "Nissan X-Trail": "suv",
  "Mitsubishi Pajero": "suv",
  "Toyota Hiace": "mpv",
  "Toyota Noah": "mpv",
};

const AREAS = [
  "Dhanmondi", "Gulshan", "Banani", "Mirpur", "Uttara", "Mohammadpur",
  "Lalmatia", "Bashundhara", "Baridhara", "Motijheel", "Wari", "Badda",
];
const COLOURS = ["#8C8F94", "#1F2A44", "#B0271E", "#F4F1EA", "#2E5339", "#3A3A3A", "#C9A96E"];
const TECHNICIANS = ["Jashim", "Karim", "Rafiq", "Shahin", "Mizan", "Anwar"];

/** Deterministic hash -> [0,1), so the same id always derives the same value across reseeds. */
function hashUnit(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

function pick<T>(arr: T[], seed: string): T {
  const idx = Math.floor(hashUnit(seed) * arr.length);
  return arr[Math.min(idx, arr.length - 1)]!;
}

export function deriveColour(vehicleId: string): string {
  return pick(COLOURS, vehicleId + ":colour");
}

/** Purely cosmetic - not in the source data. A plausible year, not tied to any real fact. */
export function deriveYear(vehicleId: string): number {
  return 2014 + Math.floor(hashUnit(vehicleId + ":year") * 11); // 2014..2024
}

export function deriveOwnerArea(ownerId: string): string {
  return pick(AREAS, ownerId + ":area");
}

/** ISO date - a plausible "customer since" in the last ~6 years, cosmetic only. */
export function deriveOwnerSince(ownerId: string, today: string): string {
  const [y] = today.split("-").map(Number);
  const yearsAgo = 1 + Math.floor(hashUnit(ownerId + ":since") * 6);
  const month = 1 + Math.floor(hashUnit(ownerId + ":sincemonth") * 12);
  const day = 1 + Math.floor(hashUnit(ownerId + ":sinceday") * 28);
  return `${(y ?? 2026) - yearsAgo}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function deriveTechnician(recordSeed: string): string {
  return pick(TECHNICIANS, recordSeed + ":tech");
}
