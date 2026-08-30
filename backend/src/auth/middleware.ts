import type { NextFunction, Request, Response } from "express";
import { ApiError } from "../api/errors.js";
import { resolveSession } from "./session.js";

function extractBearer(header: string | undefined): string | null {
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  return scheme === "Bearer" && token ? token : null;
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const token = extractBearer(req.headers.authorization);
  if (!token) {
    next(new ApiError(401, "Missing bearer token"));
    return;
  }
  const user = await resolveSession(token);
  if (!user) {
    next(new ApiError(401, "Invalid or expired token"));
    return;
  }
  req.user = user;
  next();
}
