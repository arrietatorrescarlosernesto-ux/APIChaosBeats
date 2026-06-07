import { Router } from "express";
import { requireAuth, requireAdmin } from "../middlewares/auth";
import * as artists from "../controllers/artistController";

export const artistRoutes = Router();

artistRoutes.get("/", requireAuth, requireAdmin, artists.list);
