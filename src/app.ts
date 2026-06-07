import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import { ZodError } from "zod";
import { trackRoutes } from "./routes/trackRoutes";
import { adminTrackRoutes } from "./routes/adminTrackRoutes";
import { artistRoutes } from "./routes/artistRoutes";
import { playlistRoutes } from "./routes/playlistRoutes";
import { favoriteRoutes } from "./routes/favoriteRoutes";
import { offlineRoutes } from "./routes/offlineRoutes";
import { profileRoutes } from "./routes/profileRoutes";

export const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", message: "Chaos Beats API - Acceso protegido. Se requiere autenticación." });
});

app.use("/api/tracks", trackRoutes);
app.use("/api/admin/tracks", adminTrackRoutes);
app.use("/api/artists", artistRoutes);
app.use("/api/playlists", playlistRoutes);
app.use("/api/favorites", favoriteRoutes);
app.use("/api/offline", offlineRoutes);
app.use("/api/profile", profileRoutes);

// Manejo de errores centralizado.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ZodError) {
    res.status(400).json({ error: "Datos inválidos", details: err.flatten() });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "Error interno del servidor" });
});
