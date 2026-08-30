import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../auth/middleware.js";
import { resetRule } from "../engine/complete.js";
import { computeVehicleStatus } from "../engine/schedule.js";
import { toIso } from "../engine/dates.js";
import { itemToEngine } from "../db/toEngine.js";
import { loadVehicleWithOwner } from "../db/repo.js";
import { prisma } from "../db/prisma.js";
import { ApiError } from "./errors.js";

const router = Router();
router.use(requireAuth);

const completionSchema = z.object({
  itemId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
  odometer: z.number().int().min(0),
  cost: z.number().int().min(0),
  technician: z.string().min(1),
  notes: z.string().nullable().optional(),
});

router.post("/vehicles/:vehicleId/services", async (req, res) => {
  const parsed = completionSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, parsed.error.issues[0]?.message ?? "Invalid request body");

  const vehicleId = req.params.vehicleId!;
  const vehicleRow = await prisma.vehicle.findUnique({ where: { id: vehicleId }, include: { items: true } });
  if (!vehicleRow) throw new ApiError(404, `Unknown vehicle: ${vehicleId}`);

  const itemRow = vehicleRow.items.find((i) => i.id === parsed.data.itemId);
  if (!itemRow) throw new ApiError(404, `Unknown item ${parsed.data.itemId} on vehicle ${vehicleId}`);

  const asOf = toIso(Date.now());
  if (parsed.data.date > asOf) throw new ApiError(400, "date cannot be in the future");

  // Reuses the exact reference implementation - same rule reset formula the
  // frontend's own tests assert against, applied here to the DB row.
  const engineItem = itemToEngine(itemRow);
  const resetItem = resetRule(engineItem, parsed.data.date, parsed.data.odometer);

  const ruleUpdate =
    resetItem.rule.kind === "fixedDate"
      ? { dueDate: resetItem.rule.dueDate }
      : resetItem.rule.kind === "interval"
        ? { lastDoneDate: resetItem.rule.lastDoneDate }
        : { lastDoneOdometer: resetItem.rule.lastDoneOdometer, lastDoneDate: resetItem.rule.lastDoneDate };

  const odometerMovedOn = parsed.data.odometer > vehicleRow.odometerKm;

  const [record] = await prisma.$transaction([
    prisma.serviceRecord.create({
      data: {
        vehicleId,
        itemId: itemRow.id,
        itemCode: itemRow.code,
        label: itemRow.label,
        date: parsed.data.date,
        odometer: parsed.data.odometer,
        cost: parsed.data.cost,
        technician: parsed.data.technician,
        notes: parsed.data.notes ?? null,
      },
    }),
    prisma.serviceItem.update({ where: { id: itemRow.id }, data: ruleUpdate }),
    ...(odometerMovedOn
      ? [prisma.vehicle.update({ where: { id: vehicleId }, data: { odometerKm: parsed.data.odometer, odometerReadAt: parsed.data.date } })]
      : []),
  ]);

  const found = await loadVehicleWithOwner(vehicleId);
  const vehicleStatus = found ? computeVehicleStatus(found.vehicle, found.owner, asOf) : undefined;

  res.status(201).json({
    record: { id: record.id, vehicleId: record.vehicleId, itemCode: record.itemCode, label: record.label, date: record.date, odometer: record.odometer, cost: record.cost, technician: record.technician, ...(record.notes ? { notes: record.notes } : {}) },
    vehicleStatus,
  });
});

export default router;
