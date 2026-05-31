import { Router } from "express";
import * as tracks from "../controllers/trackController";
import { requireAuth, requireAdmin } from "../middlewares/auth";

export const adminTrackRoutes = Router();

adminTrackRoutes.get("/", requireAuth, requireAdmin, tracks.listAdmin);
adminTrackRoutes.get("/:id/stream", requireAuth, requireAdmin, tracks.adminStream);
adminTrackRoutes.get("/:id", requireAuth, requireAdmin, tracks.adminGetById);
