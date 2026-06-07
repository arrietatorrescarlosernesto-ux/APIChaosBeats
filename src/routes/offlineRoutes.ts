import { Router } from "express";
import { requireAuth, requireAdmin } from "../middlewares/auth";
import * as offline from "../controllers/offlineController";

export const offlineRoutes = Router();

offlineRoutes.get("/", requireAuth, requireAdmin, offline.list);
offlineRoutes.delete("/:song_id", requireAuth, requireAdmin, offline.revoke);

