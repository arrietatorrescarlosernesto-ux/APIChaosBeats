import { Router } from "express";
import { requireAuth } from "../middlewares/auth";
import * as offline from "../controllers/offlineController";

export const offlineRoutes = Router();

offlineRoutes.get("/", requireAuth, offline.list);
offlineRoutes.delete("/:song_id", requireAuth, offline.revoke);

