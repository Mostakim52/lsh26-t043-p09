import { describe, expect, it, vi, beforeEach } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";

const db = {
  workshopUser: { findUnique: vi.fn() },
  authSession: { create: vi.fn(), findUnique: vi.fn(), delete: vi.fn() },
};

vi.mock("../db/prisma.js", () => ({ prisma: db }));

const { createApp } = await import("../app.js");

const HASH = bcrypt.hashSync("Workshop2026!", 10);
const USER = { id: "u1", email: "admin@servicedesk.local", passwordHash: HASH, name: "Nasrin Akter", role: "admin" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("auth routes", () => {
  it("rejects a malformed login body with 422", async () => {
    const app = createApp();
    const res = await request(app).post("/api/v1/auth/login").send({ email: "" });
    expect(res.status).toBe(422);
  });

  it("rejects wrong password with 401", async () => {
    db.workshopUser.findUnique.mockResolvedValue(USER);
    const app = createApp();
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "admin@servicedesk.local", password: "wrong" });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ message: "Invalid email or password." });
  });

  it("rejects an unknown email with 401 (not 404 - avoids user enumeration)", async () => {
    db.workshopUser.findUnique.mockResolvedValue(null);
    const app = createApp();
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "nope@servicedesk.local", password: "whatever" });
    expect(res.status).toBe(401);
  });

  it("logs in with correct credentials and returns a bearer token + user view", async () => {
    db.workshopUser.findUnique.mockResolvedValue(USER);
    db.authSession.create.mockResolvedValue({});
    const app = createApp();
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "admin@servicedesk.local", password: "Workshop2026!" });
    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe("string");
    expect(res.body.token.length).toBeGreaterThan(10);
    expect(res.body.user).toEqual({ id: "u1", email: "admin@servicedesk.local", name: "Nasrin Akter", role: "admin" });
    expect(res.body.user.passwordHash).toBeUndefined();
  });

  it("matches email case-insensitively and trimmed", async () => {
    db.workshopUser.findUnique.mockResolvedValue(USER);
    db.authSession.create.mockResolvedValue({});
    const app = createApp();
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "  ADMIN@ServiceDesk.local  ", password: "Workshop2026!" });
    expect(res.status).toBe(200);
    expect(db.workshopUser.findUnique).toHaveBeenCalledWith({ where: { email: "admin@servicedesk.local" } });
  });

  it("rejects protected routes without a bearer token", async () => {
    const app = createApp();
    const res = await request(app).get("/api/v1/auth/me");
    expect(res.status).toBe(401);
  });

  it("rejects an invalid/expired bearer token", async () => {
    db.authSession.findUnique.mockResolvedValue(null);
    const app = createApp();
    const res = await request(app).get("/api/v1/auth/me").set("Authorization", "Bearer bogus");
    expect(res.status).toBe(401);
  });

  it("accepts /auth/me with a valid session", async () => {
    db.authSession.findUnique.mockResolvedValue({
      tokenHash: "x",
      userId: "u1",
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
      user: USER,
    });
    const app = createApp();
    const res = await request(app).get("/api/v1/auth/me").set("Authorization", "Bearer good");
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe("admin@servicedesk.local");
  });

  it("logout always returns 204, even with no token", async () => {
    const app = createApp();
    const res = await request(app).post("/api/v1/auth/logout");
    expect(res.status).toBe(204);
  });
});
