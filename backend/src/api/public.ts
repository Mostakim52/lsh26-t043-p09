import { Router } from "express";
import { toIso } from "../engine/dates.js";
import { computeVehicleStatus } from "../engine/schedule.js";
import { loadVehicleByPlate } from "../db/repo.js";
import { ApiError } from "./errors.js";

/**
 * Anonymous, no-Bearer-token routes for the vehicle-owner self-lookup flow.
 * Deliberately excludes owner phone/area/since — a plate is visible on the
 * car itself, so this endpoint must not turn "I saw a plate" into "I have
 * this stranger's phone number and full service history."
 */
const router = Router();

router.get("/public/vehicles/by-plate/:plate", async (req, res) => {
  const plate = req.params.plate!;
  const found = await loadVehicleByPlate(plate);
  if (!found) throw new ApiError(404, "No vehicle found for that plate.");

  const asOf = typeof req.query.asOf === "string" && req.query.asOf ? req.query.asOf : toIso(Date.now());
  const status = computeVehicleStatus(found.vehicle, found.owner, asOf);

  // Redact the owner's phone/area/since — a plate is visible on the car
  // itself, so this anonymous endpoint must not turn "I saw a plate" into
  // "I have this stranger's phone number."
  res.json({
    ...status,
    owner: { id: found.owner.id, name: found.owner.name },
  });
});

export default router;
