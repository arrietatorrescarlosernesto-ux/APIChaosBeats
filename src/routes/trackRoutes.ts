import { Router } from "express";
import * as tracks from "../controllers/trackController";
import { requireAuth, requireAdmin } from "../middlewares/auth";
import * as offline from "../controllers/offlineController";

export const trackRoutes = Router();

// --- Requieren administrador ---
trackRoutes.get("/", requireAuth, requireAdmin, tracks.list);
trackRoutes.get("/:id", requireAuth, requireAdmin, tracks.getById);
trackRoutes.get("/:id/stream", requireAuth, requireAdmin, tracks.stream);
trackRoutes.get("/:id/download", requireAuth, requireAdmin, tracks.download);
trackRoutes.post("/:id/play", requireAuth, requireAdmin, tracks.play);
trackRoutes.post("/:id/offline", requireAuth, requireAdmin, offline.createForTrack);

// --- Administración (subida de música) ---
trackRoutes.post("/", requireAuth, requireAdmin, tracks.create);
trackRoutes.post("/:id/publish", requireAuth, requireAdmin, tracks.publish);
