import { Router } from "express";
import { requireAuth, requireAdmin } from "../middlewares/auth";
import * as favorites from "../controllers/favoriteController";

export const favoriteRoutes = Router();

favoriteRoutes.get("/", requireAuth, requireAdmin, favorites.list);
favoriteRoutes.post("/", requireAuth, requireAdmin, favorites.create);
favoriteRoutes.delete("/:song_id", requireAuth, requireAdmin, favorites.remove);
