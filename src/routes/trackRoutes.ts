import { Router } from "express";
import * as tracks from "../controllers/trackController";
import { requireAuth, requireAdmin } from "../middlewares/auth";
import * as offline from "../controllers/offlineController";

export const trackRoutes = Router();

// --- Públicas ---
trackRoutes.get("/", tracks.list);
trackRoutes.get("/:id", tracks.getById);
trackRoutes.get("/:id/stream", tracks.stream);
trackRoutes.get("/:id/download", tracks.download);
trackRoutes.post("/:id/play", requireAuth, tracks.play);
trackRoutes.post("/:id/offline", requireAuth, offline.createForTrack);

// --- Administración (subida de música) ---
trackRoutes.post("/", requireAuth, requireAdmin, tracks.create);
trackRoutes.post("/:id/publish", requireAuth, requireAdmin, tracks.publish);
