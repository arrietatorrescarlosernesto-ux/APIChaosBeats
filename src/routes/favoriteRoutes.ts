import { Router } from "express";
import { requireAuth } from "../middlewares/auth";
import * as favorites from "../controllers/favoriteController";

export const favoriteRoutes = Router();

favoriteRoutes.get("/", requireAuth, favorites.list);
favoriteRoutes.post("/", requireAuth, favorites.create);
favoriteRoutes.delete("/:song_id", requireAuth, favorites.remove);
