import type { Owner as PrismaOwner, ServiceItem as PrismaServiceItem, ServiceRecord as PrismaServiceRecord, Vehicle as PrismaVehicle } from "@prisma/client";
import type { Owner, ServiceItem, ServiceRecord, ServiceRule, Vehicle } from "../engine/types.js";

export function itemToEngine(row: PrismaServiceItem): ServiceItem {
  const base = { id: row.id, code: row.code, label: row.label, category: row.category as ServiceItem["category"], cost: row.cost, zone: row.zone as ServiceItem["zone"] };

  let rule: ServiceRule;
  if (row.ruleKind === "fixedDate") {
    rule = { kind: "fixedDate", dueDate: row.dueDate!, renewalMonths: row.renewalMonths! };
  } else if (row.ruleKind === "interval") {
    rule = { kind: "interval", months: row.months!, lastDoneDate: row.lastDoneDate! };
  } else {
    rule = { kind: "distance", intervalKm: row.intervalKm!, lastDoneOdometer: row.lastDoneOdometer!, lastDoneDate: row.lastDoneDate! };
  }
  return { ...base, rule };
}

export function vehicleToEngine(row: PrismaVehicle & { items: PrismaServiceItem[] }): Vehicle {
  return {
    id: row.id,
    ownerId: row.ownerId,
    make: row.make,
    model: row.model,
    year: row.year,
    plate: row.plate,
    colour: row.colour,
    bodyType: row.bodyType as Vehicle["bodyType"],
    odometer: { km: row.odometerKm, readAt: row.odometerReadAt },
    avgKmPerDay: row.avgKmPerDay,
    items: row.items.map(itemToEngine),
  };
}

export function ownerToEngine(row: PrismaOwner): Owner {
  return { id: row.id, name: row.name, phone: row.phone, area: row.area, since: row.since };
}

export function recordToEngine(row: PrismaServiceRecord): ServiceRecord {
  return {
    id: row.id,
    vehicleId: row.vehicleId,
    itemCode: row.itemCode,
    label: row.label,
    date: row.date,
    odometer: row.odometer,
    cost: row.cost,
    technician: row.technician,
    ...(row.notes ? { notes: row.notes } : {}),
  };
}
