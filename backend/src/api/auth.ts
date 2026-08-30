import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../auth/middleware.js";
import { verifyPassword } from "../auth/passwords.js";
import { createSession, deleteSession } from "../auth/session.js";
import { prisma } from "../db/prisma.js";
import { ApiError } from "./errors.js";

const router = Router();

const loginSchema = z.object({ email: z.string().min(1), password: z.string().min(1) });

function toUserView(u: { id: string; email: string; name: string; role: string }) {
  return { id: u.id, email: u.email, name: u.name, role: u.role };
}

router.post("/auth/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(422, "Please check your details.");

  // "email may be an email or phone/username" per CLAUDE.md - accept
  // case-insensitively, trimmed, matched against the stored email field.
  const identifier = parsed.data.email.trim().toLowerCase();
  const user = await prisma.workshopUser.findUnique({ where: { email: identifier } });
  const ok = user ? await verifyPassword(parsed.data.password, user.passwordHash) : false;

  if (!user || !ok) throw new ApiError(401, "Invalid email or password.");

  const token = await createSession(user.id);
  res.json({ token, user: toUserView(user) });
});

router.get("/auth/me", requireAuth, (req, res) => {
  res.json({ user: toUserView(req.user!) });
});

router.post("/auth/logout", async (req, res) => {
  const auth = req.headers.authorization;
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  if (token) await deleteSession(token);
  res.status(204).end();
});

export default router;
