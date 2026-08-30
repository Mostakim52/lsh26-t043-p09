import { randomBytes, createHash } from "node:crypto";
import { prisma } from "../db/prisma.js";

const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Returns the raw bearer token; only its hash is persisted. */
export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  await prisma.authSession.create({
    data: { tokenHash: hashToken(token), userId, expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
  });
  return token;
}

export async function resolveSession(token: string) {
  const tokenHash = hashToken(token);
  const session = await prisma.authSession.findUnique({ where: { tokenHash }, include: { user: true } });
  if (!session) return null;
  if (session.expiresAt.getTime() <= Date.now()) {
    await prisma.authSession.delete({ where: { tokenHash } }).catch(() => {});
    return null;
  }
  return session.user;
}

export async function deleteSession(token: string): Promise<void> {
  await prisma.authSession.delete({ where: { tokenHash: hashToken(token) } }).catch(() => {});
}
