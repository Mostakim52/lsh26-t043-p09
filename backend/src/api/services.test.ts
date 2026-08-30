import { describe, expect, it, vi, beforeEach } from "vitest";
import request from "supertest";

vi.mock("../auth/middleware.js", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: "u1", email: "admin@servicedesk.local", name: "Nasrin Akter", role: "admin" };
    next();
  },
}));

const db = {
  vehicle: { findUnique: vi.fn(), update: vi.fn() },
  serviceRecord: { create: vi.fn() },
  serviceItem: { update: vi.fn() },
  $transaction: vi.fn((ops: unknown[]) => Promise.all(ops)),
};

vi.mock("../db/prisma.js", () => ({ prisma: db }));
vi.mock("../db/repo.js", () => ({
  loadVehicleWithOwner: vi.fn().mockResolvedValue(null),
}));

const { createApp } = await import("../app.js");

const INTERVAL_ITEM = {
  id: "item-1",
  code: "AC_SERVICE",
  label: "AC service",
  category: "maintenance",
  zone: "cabin",
  cost: 2000,
  ruleKind: "interval",
  dueDate: null,
  renewalMonths: null,
  months: 12,
  lastDoneDate: "2026-03-15",
  intervalKm: null,
  lastDoneOdometer: null,
};

const VEHICLE_ROW = {
  id: "veh-1",
  ownerId: "own-1",
  make: "Toyota",
  model: "Axio",
  year: 2018,
  plate: "DHA-1234",
  colour: "#333",
  bodyType: "sedan",
  odometerKm: 101743,
  odometerReadAt: "2026-08-01",
  avgKmPerDay: 73,
  items: [INTERVAL_ITEM],
};

beforeEach(() => {
  vi.clearAllMocks();
  db.$transaction.mockImplementation((ops: unknown[]) => Promise.all(ops));
});

describe("POST /vehicles/:vehicleId/services", () => {
  it("rejects a malformed body with 400", async () => {
    const app = createApp();
    const res = await request(app).post("/api/v1/vehicles/veh-1/services").send({ itemId: "item-1" });
    expect(res.status).toBe(400);
  });

  it("returns 404 for an unknown vehicle", async () => {
    db.vehicle.findUnique.mockResolvedValue(null);
    const app = createApp();
    const res = await request(app)
      .post("/api/v1/vehicles/nope/services")
      .send({ itemId: "item-1", date: "2026-08-30", odometer: 102000, cost: 2000, technician: "X" });
    expect(res.status).toBe(404);
  });

  it("returns 404 for an unknown item on a known vehicle", async () => {
    db.vehicle.findUnique.mockResolvedValue(VEHICLE_ROW);
    const app = createApp();
    const res = await request(app)
      .post("/api/v1/vehicles/veh-1/services")
      .send({ itemId: "does-not-exist", date: "2026-08-30", odometer: 102000, cost: 2000, technician: "X" });
    expect(res.status).toBe(404);
  });

  it("rejects a future-dated completion with 400", async () => {
    db.vehicle.findUnique.mockResolvedValue(VEHICLE_ROW);
    const app = createApp();
    const res = await request(app)
      .post("/api/v1/vehicles/veh-1/services")
      .send({ itemId: "item-1", date: "2099-01-01", odometer: 102000, cost: 2000, technician: "X" });
    expect(res.status).toBe(400);
  });

  it("accepts a valid completion, resets the rule, and moves the odometer forward", async () => {
    db.vehicle.findUnique.mockResolvedValue(VEHICLE_ROW);
    db.serviceRecord.create.mockResolvedValue({
      id: "rec-1",
      vehicleId: "veh-1",
      itemId: "item-1",
      itemCode: "AC_SERVICE",
      label: "AC service",
      date: "2026-08-30",
      odometer: 102243,
      cost: 2000,
      technician: "Test Technician",
      notes: "e2e",
    });

    const app = createApp();
    const res = await request(app)
      .post("/api/v1/vehicles/veh-1/services")
      .send({ itemId: "item-1", date: "2026-08-30", odometer: 102243, cost: 2000, technician: "Test Technician", notes: "e2e" });

    expect(res.status).toBe(201);
    expect(res.body.record.date).toBe("2026-08-30");
    expect(db.$transaction).toHaveBeenCalledTimes(1);

    const ops = db.$transaction.mock.calls[0][0];
    expect(ops).toHaveLength(3); // create record + update item + odometer moved forward
    expect(db.serviceItem.update).toHaveBeenCalledWith({
      where: { id: "item-1" },
      data: { lastDoneDate: "2026-08-30" },
    });
    expect(db.vehicle.update).toHaveBeenCalledWith({
      where: { id: "veh-1" },
      data: { odometerKm: 102243, odometerReadAt: "2026-08-30" },
    });
  });

  it("does not touch the vehicle's odometer when the reading didn't move forward", async () => {
    db.vehicle.findUnique.mockResolvedValue(VEHICLE_ROW);
    db.serviceRecord.create.mockResolvedValue({
      id: "rec-2",
      vehicleId: "veh-1",
      itemId: "item-1",
      itemCode: "AC_SERVICE",
      label: "AC service",
      date: "2026-08-30",
      odometer: 101743,
      cost: 2000,
      technician: "X",
      notes: null,
    });

    const app = createApp();
    const res = await request(app)
      .post("/api/v1/vehicles/veh-1/services")
      .send({ itemId: "item-1", date: "2026-08-30", odometer: 101743, cost: 2000, technician: "X" });

    expect(res.status).toBe(201);
    const ops = db.$transaction.mock.calls[0][0];
    expect(ops).toHaveLength(2); // no odometer update
    expect(db.vehicle.update).not.toHaveBeenCalled();
  });
});
