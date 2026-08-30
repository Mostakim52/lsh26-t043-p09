import type { NextFunction, Request, Response } from "express";

export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** CLAUDE.md's error shape for this problem: { message: string }, not the nested envelope P08 used. */
export function errorHandler(err: unknown, _req: Request, res: Response, next: NextFunction): void {
  if (res.headersSent) {
    next(err);
    return;
  }
  if (err instanceof ApiError) {
    res.status(err.statusCode).json({ message: err.message });
    return;
  }
  console.error("[unhandled]", err);
  res.status(500).json({ message: "Internal server error" });
}
