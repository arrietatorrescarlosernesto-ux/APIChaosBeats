import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import * as favoriteService from "../services/favoriteService";

function isRlsDenied(err: unknown): boolean {
  const anyErr = err as { code?: string; status?: number; message?: string } | null;
  if (!anyErr) return false;
  if (anyErr.status === 401 || anyErr.status === 403) return true;
  if (anyErr.code === "42501") return true;
  if (typeof anyErr.message === "string" && anyErr.message.toLowerCase().includes("row-level security")) {
    return true;
  }
  return false;
}

export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const accessToken = req.accessToken;
    const userId = req.user?.id;
    if (!accessToken || !userId) {
      res.status(401).json({ error: "Falta autenticación" });
      return;
    }
    res.json(await favoriteService.listFavorites({ accessToken, userId }));
  } catch (err) {
    if (isRlsDenied(err)) res.status(403).json({ error: "Operación no permitida" });
    else next(err);
  }
}

const createBody = z.object({ song_id: z.string().uuid() });

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const accessToken = req.accessToken;
    const userId = req.user?.id;
    if (!accessToken || !userId) {
      res.status(401).json({ error: "Falta autenticación" });
      return;
    }
    const body = createBody.parse(req.body);
    const result = await favoriteService.addFavorite({ accessToken, userId, songId: body.song_id });
    res.status(result.created ? 201 : 200).json(result.favorite);
  } catch (err) {
    if (isRlsDenied(err)) res.status(403).json({ error: "Operación no permitida" });
    else next(err);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const accessToken = req.accessToken;
    const userId = req.user?.id;
    if (!accessToken || !userId) {
      res.status(401).json({ error: "Falta autenticación" });
      return;
    }
    const deleted = await favoriteService.removeFavorite({
      accessToken,
      userId,
      songId: req.params.song_id,
    });
    if (!deleted) {
      res.status(404).json({ error: "Favorito no encontrado" });
      return;
    }
    res.status(204).end();
  } catch (err) {
    if (isRlsDenied(err)) res.status(403).json({ error: "Operación no permitida" });
    else next(err);
  }
}
