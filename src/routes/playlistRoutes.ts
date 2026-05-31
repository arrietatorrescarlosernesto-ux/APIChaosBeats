import { Router } from "express";
import { requireAuth } from "../middlewares/auth";
import * as playlists from "../controllers/playlistController";

export const playlistRoutes = Router();

playlistRoutes.post("/", requireAuth, playlists.create);
playlistRoutes.get("/me", requireAuth, playlists.listMine);
playlistRoutes.get("/:id", requireAuth, playlists.getById);
playlistRoutes.patch("/:id", requireAuth, playlists.patch);
playlistRoutes.delete("/:id", requireAuth, playlists.remove);
playlistRoutes.post("/:id/songs", requireAuth, playlists.addSong);
playlistRoutes.delete("/:id/songs/:song_id", requireAuth, playlists.removeSong);
