import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import * as offlineService from "../services/offlineService";

const createBody = z.object({ device_id: z.string().trim().min(1).optional() });

export async function createForTrack(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Falta autenticación" });
      return;
    }
    const body = createBody.parse(req.body ?? {});
    const result = await offlineService.createOfflineTokenForSong({
      userId,
      songId: req.params.id,
      deviceId: body.device_id,
    });
    if (!result) {
      res.status(404).json({ error: "Canción no disponible" });
      return;
    }
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Falta autenticación" });
      return;
    }
    res.json(await offlineService.listOffline({ userId }));
  } catch (err) {
    next(err);
  }
}

export async function revoke(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Falta autenticación" });
      return;
    }
    const revoked = await offlineService.revokeOfflineTokensForSong({ userId, songId: req.params.song_id });
    if (!revoked) {
      res.status(404).json({ error: "No existe token offline para esa canción" });
      return;
    }
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

