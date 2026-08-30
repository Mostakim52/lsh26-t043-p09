import { prisma } from "./prisma.js";
import { ownerToEngine, recordToEngine, vehicleToEngine } from "./toEngine.js";
import type { Fleet } from "../engine/types.js";

const WORKSHOP_META = { workshop: "Service Desk", city: "Dhaka", currency: "BDT" };

export async function loadFleet(): Promise<Fleet> {
  const [owners, vehicles, records] = await Promise.all([
    prisma.owner.findMany(),
    prisma.vehicle.findMany({ include: { items: true } }),
    prisma.serviceRecord.findMany({ orderBy: { date: "desc" } }),
  ]);

  return {
    meta: { ...WORKSHOP_META, generatedAt: new Date().toISOString().slice(0, 10) },
    owners: owners.map(ownerToEngine),
    vehicles: vehicles.map(vehicleToEngine),
    history: records.map(recordToEngine),
  };
}

export async function loadVehicleWithOwner(vehicleId: string) {
  const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId }, include: { items: true } });
  if (!vehicle) return null;
  const owner = await prisma.owner.findUnique({ where: { id: vehicle.ownerId } });
  if (!owner) return null;
  return {
    vehicle: vehicleToEngine(vehicle),
    owner: ownerToEngine(owner),
  };
}

export async function loadHistoryForVehicle(vehicleId: string) {
  const records = await prisma.serviceRecord.findMany({ where: { vehicleId }, orderBy: { date: "desc" } });
  return records.map(recordToEngine);
}

/** Case/whitespace-insensitive plate match, for the anonymous owner self-lookup. */
export async function loadVehicleByPlate(plate: string) {
  const normalized = plate.trim().toUpperCase().replace(/\s+/g, "");
  const vehicles = await prisma.vehicle.findMany({ include: { items: true } });
  const match = vehicles.find((v) => v.plate.trim().toUpperCase().replace(/\s+/g, "") === normalized);
  if (!match) return null;
  const owner = await prisma.owner.findUnique({ where: { id: match.ownerId } });
  if (!owner) return null;
  return {
    vehicle: vehicleToEngine(match),
    owner: ownerToEngine(owner),
  };
}
