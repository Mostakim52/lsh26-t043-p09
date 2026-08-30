import { loadFixture } from "./fixture.js";
import { normalizeCase } from "./normalize.js";
import { prisma } from "./prisma.js";

/** Which of the 25 public cases becomes the live dataset. No batch-switching
 *  UI exists on the frontend, matching P08's single-active-dataset pattern. */
const ACTIVE_CASE_ID = "PUB-01";

async function main(): Promise<void> {
  const fixture = loadFixture();
  const rawCase = fixture.cases.find((c) => c.case_id === ACTIVE_CASE_ID);
  if (!rawCase) throw new Error(`case ${ACTIVE_CASE_ID} not found in fixture`);

  const normalized = normalizeCase(rawCase);
  console.log(`[seed] validated ${normalized.caseId}: ${normalized.owners.length} owners, ${normalized.vehicles.length} vehicles`);

  await prisma.serviceRecord.deleteMany({});
  await prisma.serviceItem.deleteMany({});
  await prisma.vehicle.deleteMany({});
  await prisma.owner.deleteMany({});

  const ownerIdByExt = new Map<string, string>();
  for (const o of normalized.owners) {
    const created = await prisma.owner.create({ data: { name: o.name, phone: o.phone, area: o.area, since: o.since } });
    ownerIdByExt.set(o.extId, created.id);
  }

  // vehicleExtId -> created Vehicle.id, and "vehicleExtId:code" -> created
  // ServiceItem.id, both captured at creation time - no need to re-query by
  // a business key like plate afterward.
  const vehicleIdByExt = new Map<string, string>();
  const itemIdByExtAndCode = new Map<string, string>();

  for (const v of normalized.vehicles) {
    const ownerId = ownerIdByExt.get(v.ownerExtId);
    if (!ownerId) throw new Error(`vehicle ${v.extId}: no created owner for ${v.ownerExtId}`);

    const createdVehicle = await prisma.vehicle.create({
      data: {
        ownerId,
        make: v.make,
        model: v.model,
        year: v.year,
        plate: v.plate,
        colour: v.colour,
        bodyType: v.bodyType,
        odometerKm: v.odometerKm,
        odometerReadAt: v.odometerReadAt,
        avgKmPerDay: v.avgKmPerDay,
      },
    });
    vehicleIdByExt.set(v.extId, createdVehicle.id);

    await prisma.serviceItem.createMany({
      data: v.items.map((i) => ({
        vehicleId: createdVehicle.id,
        code: i.code,
        label: i.label,
        category: i.category,
        zone: i.zone,
        cost: i.cost,
        ruleKind: i.ruleKind,
        dueDate: i.dueDate ?? null,
        renewalMonths: i.renewalMonths ?? null,
        months: i.months ?? null,
        lastDoneDate: i.lastDoneDate ?? null,
        intervalKm: i.intervalKm ?? null,
        lastDoneOdometer: i.lastDoneOdometer ?? null,
      })),
    });

    const createdItems = await prisma.serviceItem.findMany({ where: { vehicleId: createdVehicle.id }, select: { id: true, code: true } });
    for (const ci of createdItems) itemIdByExtAndCode.set(`${v.extId}:${ci.code}`, ci.id);
  }

  await prisma.serviceRecord.createMany({
    data: normalized.records.map((r) => {
      const vehicleId = vehicleIdByExt.get(r.vehicleExtId);
      const itemId = itemIdByExtAndCode.get(`${r.vehicleExtId}:${r.itemCode}`);
      if (!vehicleId || !itemId) throw new Error(`record for ${r.vehicleExtId}/${r.itemCode}: missing created ids`);
      return { vehicleId, itemId, itemCode: r.itemCode, label: r.label, date: r.date, odometer: r.odometer, cost: r.cost, technician: r.technician };
    }),
  });

  console.log(`[seed] ${normalized.records.length} service records`);
  console.log("[seed] done");
}

main()
  .catch((error: unknown) => {
    console.error("[seed] failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
