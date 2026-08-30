import { readFileSync } from "node:fs";
import { z } from "zod";

/** Raw case format, per P09_vehicle_service_public.json's own format_note. */

export const fixtureServiceItemSchema = z.discriminatedUnion("rule", [
  z.object({ name: z.string(), rule: z.literal("fixed_date"), due_date: z.string(), cost_bdt: z.string() }),
  z.object({ name: z.string(), rule: z.literal("period_months"), every_months: z.number().int().positive(), cost_bdt: z.string() }),
  z.object({ name: z.string(), rule: z.literal("distance_km"), every_km: z.number().int().positive(), cost_bdt: z.string() }),
]);

export const fixtureHistorySchema = z.object({
  item: z.string(),
  date: z.string(),
  km: z.number().int().nullable(),
  cost_bdt: z.string(),
});

export const fixtureOwnerSchema = z.object({
  id: z.string(),
  name: z.string(),
  phone: z.string(),
});

export const fixtureVehicleSchema = z.object({
  id: z.string(),
  owner_id: z.string(),
  model: z.string(),
  plate: z.string(),
  odometer_readings: z.array(z.object({ date: z.string(), km: z.number().int() })).min(1),
  service_items: z.array(fixtureServiceItemSchema).min(1),
  service_history: z.array(fixtureHistorySchema),
});

export const fixtureCaseSchema = z.object({
  case_id: z.string(),
  today: z.string(),
  owners: z.array(fixtureOwnerSchema).min(1),
  vehicles: z.array(fixtureVehicleSchema).min(1),
});

export const fixtureFileSchema = z.object({
  schema_version: z.string(),
  problem_id: z.string(),
  cases: z.array(fixtureCaseSchema).min(1),
});

export type FixtureCase = z.infer<typeof fixtureCaseSchema>;
export type FixtureVehicle = z.infer<typeof fixtureVehicleSchema>;
export type FixtureFile = z.infer<typeof fixtureFileSchema>;

const DEFAULT_PATH = new URL("./data/cases.json", import.meta.url);

export function loadFixture(path: URL | string = DEFAULT_PATH): FixtureFile {
  const raw = readFileSync(path, "utf-8");
  return fixtureFileSchema.parse(JSON.parse(raw));
}
