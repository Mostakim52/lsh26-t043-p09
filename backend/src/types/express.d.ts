import type { WorkshopUser } from "@prisma/client";

declare global {
  namespace Express {
    interface Request {
      user?: WorkshopUser;
    }
  }
}

export {};
