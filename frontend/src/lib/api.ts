import type { CompletionInput } from '../engine/complete';
import type {
  CallListEntry,
  Fleet,
  Owner,
  ServiceRecord,
  VehicleStatus,
} from '../engine/types';

// ---------------------------------------------------------------- backend base
/**
 * Where the data comes from. Set VITE_API_BASE_URL in .env (or .env.local) to point at
 * a local or deployed backend; leave it blank to run against the bundled sample fleet.
 */
const BASE = (import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/+$/, '');

export const backendConfigured = BASE.length > 0;
export const backendBaseUrl = BASE;

export type FleetSource = 'backend' | 'sample';

export interface FleetLoad {
  fleet: Fleet;
  source: FleetSource;
  /** Set when the backend was configured but could not be reached. */
  notice?: string;
}

const SAMPLE_URL = `${import.meta.env.BASE_URL ?? '/'}data/fleet.json`.replace('//data', '/data');

async function loadSample(): Promise<Fleet> {
  const response = await fetch(SAMPLE_URL);
  if (!response.ok) throw new Error(`Sample fleet missing (HTTP ${response.status})`);
  return (await response.json()) as Fleet;
}

// ---------------------------------------------------------------- helpers
function asOfParam(asOf?: string): string {
  return asOf ? `?asOf=${encodeURIComponent(asOf)}` : '';
}

function authHeader(): Record<string, string> {
  try {
    const token = localStorage.getItem('servicedesk.auth.token.v1');
    if (token) return { Authorization: `Bearer ${token}` };
  } catch { /* ignore */ }
  return {};
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Accept: 'application/json', ...authHeader() },
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`GET ${path} failed (HTTP ${res.status}). ${detail}`.trim());
  }
  return (await res.json()) as T;
}

// ---------------------------------------------------------------- fleet (raw)
/**
 * A demo should never die because a backend is cold, so a failed call falls back to the
 * bundled fleet and says so rather than showing an empty screen.
 */
export async function loadFleet(asOf?: string): Promise<FleetLoad> {
  if (!backendConfigured) {
    return { fleet: await loadSample(), source: 'sample' };
  }

  try {
    const fleet = await getJson<Fleet>(`/fleet${asOfParam(asOf)}`);
    return { fleet, source: 'backend' };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return {
      fleet: await loadSample(),
      source: 'sample',
      notice: `Could not reach ${BASE} (${reason}). Showing the bundled sample fleet.`,
    };
  }
}

// ---------------------------------------------------------------- enriched endpoints — backend is the calculator
// Frontend never imports src/engine/schedule.ts | callList.ts when backendConfigured === true;
// it renders JSON the backend returned.

export interface FleetSummary {
  vehicles: number;
  owners: number;
  itemsTracked: number;
  overdueItems: number;
  dueSoonItems: number;
  fineItems: number;
  vehiclesOverdue: number;
  vehiclesDueSoon: number;
  pipelineValue: number;
  overdueValue: number;
}

export interface RulesResponse {
  dueSoonDays: number;
  priorityWeights: { perOverdueDay: number; perImminenceDay: number; perCurrencyUnit: number };
  ruleDocs: Record<string, { title: string; text: string; examples: string }>;
  statusDocs: Record<string, string>;
}

export interface VehicleDetail {
  status: VehicleStatus;
  history: ServiceRecord[];
}

export async function fetchVehicles(asOf?: string): Promise<VehicleStatus[]> {
  return getJson<VehicleStatus[]>(`/vehicles${asOfParam(asOf)}`);
}

export async function fetchVehicle(id: string, asOf?: string): Promise<VehicleDetail> {
  return getJson<VehicleDetail>(`/vehicles/${encodeURIComponent(id)}${asOfParam(asOf)}`);
}

export async function fetchCallList(asOf?: string): Promise<CallListEntry[]> {
  return getJson<CallListEntry[]>(`/call-list${asOfParam(asOf)}`);
}

export async function fetchFleetSummary(asOf?: string): Promise<FleetSummary> {
  return getJson<FleetSummary>(`/fleet/summary${asOfParam(asOf)}`);
}

export async function fetchOwners(): Promise<Owner[]> {
  return getJson<Owner[]>(`/owners`);
}

export async function fetchRules(): Promise<RulesResponse> {
  return getJson<RulesResponse>(`/rules`);
}

export async function fetchHealth(): Promise<{ ok: boolean; asOf: string }> {
  return getJson<{ ok: boolean; asOf: string }>(`/health`);
}

// ---------------------------------------------------------------- mutation
export interface CompletionResponse {
  record: ServiceRecord;
  vehicleStatus?: VehicleStatus;
}

/**
 * Push a completed service to the backend. Returns null when no backend is configured,
 * which is the signal to the store that the change lives locally only.
 */
export async function postCompletion(input: CompletionInput): Promise<ServiceRecord | null> {
  if (!backendConfigured) return null;

  const response = await fetch(`${BASE}/vehicles/${input.vehicleId}/services`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...authHeader() },
    body: JSON.stringify({
      itemId: input.itemId,
      date: input.date,
      odometer: input.odometer,
      cost: input.cost,
      technician: input.technician,
      notes: input.notes ?? null,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Backend rejected the service record (HTTP ${response.status}). ${detail}`.trim());
  }

  const data = (await response.json()) as CompletionResponse | ServiceRecord;
  // Backend may return { record } or bare ServiceRecord — accept both.
  if (data && typeof data === 'object' && 'record' in data) return (data as CompletionResponse).record;
  return data as ServiceRecord;
}
