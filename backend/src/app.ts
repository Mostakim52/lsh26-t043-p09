import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";

import apiRouter from "./api/router.js";
import { errorHandler } from "./api/errors.js";
import { env } from "./config/env.js";

export function createApp(): Express {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      // The Vite dev server per CLAUDE.md §7. Auth here is a Bearer token,
      // not a cookie, so there's no credentials-mode/SameSite complexity at
      // all - the lesson from P08 doesn't even apply to this architecture.
      origin: env.FRONTEND_ORIGIN,
    }),
  );
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/v1/health", (_req, res) => {
    res.json({ ok: true, asOf: new Date().toISOString().slice(0, 10) });
  });

  app.use("/api/v1", apiRouter);

  app.use(errorHandler);

  return app;
}
