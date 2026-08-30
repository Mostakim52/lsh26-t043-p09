import { Router } from "express";
import authRouter from "./auth.js";
import fleetRouter from "./fleet.js";
import publicRouter from "./public.js";
import servicesRouter from "./services.js";

const router = Router();
router.use(authRouter);
router.use(publicRouter);
router.use(fleetRouter);
router.use(servicesRouter);

export default router;
