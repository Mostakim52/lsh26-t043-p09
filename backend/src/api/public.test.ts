import { describe, expect, it, vi, beforeEach } from "vitest";
import request from "supertest";

const db = {
  vehicle: { findMany: vi.fn() },
  owner: { findUnique: vi.fn() },
};

vi.mock("../db/prisma.js", () => ({ prisma: db }));

const { createApp } = await import("../app.js");

const VEHICLE_ROW = {
  id: "veh-1",
  ownerId: "own-1",
  make: "Toyota",
  model: "Axio",
  year: 2018,
  plate: "Dhaka Metro Ba 18-3510",
  colour: "#333",
  bodyType: "sedan",
  odometerKm: 68480,
  odometerReadAt: "2026-08-01",
  avgKmPerDay: 40,
  items: [],
};

const OWNER_ROW = { id: "own-1", name: "Shirin Ali", phone: "01700000000", area: "Gulshan", since: "2020-01-01" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /public/vehicles/by-plate/:plate", () => {
  it("does not require a bearer token", async () => {
    db.vehicle.findMany.mockResolvedValue([VEHICLE_ROW]);
    db.owner.findUnique.mockResolvedValue(OWNER_ROW);
    const app = createApp();
    const res = await request(app).get("/api/v1/public/vehicles/by-plate/Dhaka Metro Ba 18-3510");
    expect(res.status).toBe(200);
  });

  it("matches case- and whitespace-insensitively", async () => {
    db.vehicle.findMany.mockResolvedValue([VEHICLE_ROW]);
    db.owner.findUnique.mockResolvedValue(OWNER_ROW);
    const app = createApp();
    const res = await request(app).get("/api/v1/public/vehicles/by-plate/dhakametroba18-3510");
    expect(res.status).toBe(200);
    expect(res.body.vehicle.plate).toBe(VEHICLE_ROW.plate);
  });

  it("returns 404 for an unknown plate", async () => {
    db.vehicle.findMany.mockResolvedValue([VEHICLE_ROW]);
    const app = createApp();
    const res = await request(app).get("/api/v1/public/vehicles/by-plate/NO-SUCH-PLATE");
    expect(res.status).toBe(404);
  });

  it("redacts the owner's phone, area, and since date", async () => {
    db.vehicle.findMany.mockResolvedValue([VEHICLE_ROW]);
    db.owner.findUnique.mockResolvedValue(OWNER_ROW);
    const app = createApp();
    const res = await request(app).get("/api/v1/public/vehicles/by-plate/Dhaka Metro Ba 18-3510");
    expect(res.body.owner).toEqual({ id: "own-1", name: "Shirin Ali" });
    expect(res.body.owner.phone).toBeUndefined();
    expect(res.body.owner.area).toBeUndefined();
  });

  it("includes schedules so the owner can see what's due", async () => {
    db.vehicle.findMany.mockResolvedValue([{ ...VEHICLE_ROW, items: [
      { id: "item-1", code: "INSURANCE", label: "Insurance", category: "legal", zone: "body", cost: 5000, ruleKind: "fixedDate", dueDate: "2026-09-15", renewalMonths: 12, months: null, lastDoneDate: null, intervalKm: null, lastDoneOdometer: null },
    ] }]);
    db.owner.findUnique.mockResolvedValue(OWNER_ROW);
    const app = createApp();
    const res = await request(app).get("/api/v1/public/vehicles/by-plate/Dhaka Metro Ba 18-3510");
    expect(res.status).toBe(200);
    expect(res.body.schedules).toHaveLength(1);
    expect(res.body.schedules[0].item.code).toBe("INSURANCE");
  });
});
