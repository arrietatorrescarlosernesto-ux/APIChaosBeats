import { Router } from "express";
import { requireAuth, requireAdmin } from "../middlewares/auth";
import * as playlists from "../controllers/playlistController";

export const playlistRoutes = Router();

playlistRoutes.post("/", requireAuth, requireAdmin, playlists.create);
playlistRoutes.get("/me", requireAuth, requireAdmin, playlists.listMine);
playlistRoutes.get("/:id", requireAuth, requireAdmin, playlists.getById);
playlistRoutes.patch("/:id", requireAuth, requireAdmin, playlists.patch);
playlistRoutes.delete("/:id", requireAuth, requireAdmin, playlists.remove);
playlistRoutes.post("/:id/songs", requireAuth, requireAdmin, playlists.addSong);
playlistRoutes.delete("/:id/songs/:song_id", requireAuth, requireAdmin, playlists.removeSong);
