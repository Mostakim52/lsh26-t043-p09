import { Router } from "express";
import { requireAuth } from "../auth/middleware.js";
import { toIso } from "../engine/dates.js";
import { buildCallList, summariseFleet } from "../engine/callList.js";
import { RULE_DOCS, DUE_SOON_DAYS, PRIORITY_WEIGHTS, STATUS_DOCS } from "../engine/rules.js";
import { computeVehicleStatus } from "../engine/schedule.js";
import { loadFleet, loadHistoryForVehicle, loadVehicleWithOwner } from "../db/repo.js";
import { ApiError } from "./errors.js";

const router = Router();
router.use(requireAuth);

function resolveAsOf(query: unknown): string {
  if (typeof query === "string" && query.length > 0) return query;
  return toIso(Date.now());
}

router.get("/fleet", async (_req, res) => {
  const fleet = await loadFleet();
  res.json(fleet);
});

router.get("/vehicles", async (req, res) => {
  const asOf = resolveAsOf(req.query.asOf);
  const fleet = await loadFleet();
  const ownersById = new Map(fleet.owners.map((o) => [o.id, o]));
  const statuses = fleet.vehicles
    .map((v) => {
      const owner = ownersById.get(v.ownerId);
      return owner ? computeVehicleStatus(v, owner, asOf) : null;
    })
    .filter((s) => s !== null);
  res.json(statuses);
});

router.get("/vehicles/:id", async (req, res) => {
  const asOf = resolveAsOf(req.query.asOf);
  const found = await loadVehicleWithOwner(req.params.id!);
  if (!found) throw new ApiError(404, "Vehicle not found");
  const status = computeVehicleStatus(found.vehicle, found.owner, asOf);
  const history = await loadHistoryForVehicle(req.params.id!);
  res.json({ status, history });
});

router.get("/call-list", async (req, res) => {
  const asOf = resolveAsOf(req.query.asOf);
  const fleet = await loadFleet();
  res.json(buildCallList(fleet, asOf));
});

router.get("/fleet/summary", async (req, res) => {
  const asOf = resolveAsOf(req.query.asOf);
  const fleet = await loadFleet();
  res.json(summariseFleet(fleet, asOf));
});

router.get("/owners", async (_req, res) => {
  const fleet = await loadFleet();
  res.json(fleet.owners);
});

router.get("/rules", (_req, res) => {
  res.json({
    dueSoonDays: DUE_SOON_DAYS,
    priorityWeights: PRIORITY_WEIGHTS,
    ruleDocs: RULE_DOCS,
    statusDocs: STATUS_DOCS,
  });
});

export default router;
