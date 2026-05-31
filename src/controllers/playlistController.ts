import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import * as playlistService from "../services/playlistService";

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

const createBody = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().min(1).optional(),
  cover_url: z.string().url().optional(),
  is_public: z.boolean().optional(),
  is_collaborative: z.boolean().optional(),
});

export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const accessToken = req.accessToken;
    const userId = req.user?.id;
    if (!accessToken || !userId) {
      res.status(401).json({ error: "Falta autenticación" });
      return;
    }
    const input = createBody.parse(req.body);
    const playlist = await playlistService.createPlaylist({ accessToken, userId, input });
    res.status(201).json(playlist);
  } catch (err) {
    if (isRlsDenied(err)) res.status(403).json({ error: "Operación no permitida" });
    else next(err);
  }
}

export async function listMine(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const accessToken = req.accessToken;
    const userId = req.user?.id;
    if (!accessToken || !userId) {
      res.status(401).json({ error: "Falta autenticación" });
      return;
    }
    res.json(await playlistService.listMyPlaylists({ accessToken, userId }));
  } catch (err) {
    if (isRlsDenied(err)) res.status(403).json({ error: "Operación no permitida" });
    else next(err);
  }
}

export async function getById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const accessToken = req.accessToken;
    if (!accessToken) {
      res.status(401).json({ error: "Falta autenticación" });
      return;
    }

    const playlist = await playlistService.getPlaylist({ accessToken, id: req.params.id });
    if (!playlist) {
      res.status(404).json({ error: "Playlist no encontrada" });
      return;
    }
    const songs = await playlistService.getPlaylistSongs({ accessToken, playlistId: req.params.id });
    res.json({ playlist, songs });
  } catch (err) {
    if (isRlsDenied(err)) res.status(403).json({ error: "Operación no permitida" });
    else next(err);
  }
}

const patchBody = z.object({
  name: z.string().trim().min(1).optional(),
  description: z.string().trim().min(1).nullable().optional(),
  cover_url: z.string().url().nullable().optional(),
  is_public: z.boolean().optional(),
  is_collaborative: z.boolean().optional(),
});

export async function patch(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const accessToken = req.accessToken;
    if (!accessToken) {
      res.status(401).json({ error: "Falta autenticación" });
      return;
    }
    const patch = patchBody.parse(req.body);
    const updated = await playlistService.patchPlaylist({ accessToken, id: req.params.id, patch });
    if (!updated) {
      res.status(404).json({ error: "Playlist no encontrada" });
      return;
    }
    res.json(updated);
  } catch (err) {
    if (isRlsDenied(err)) res.status(403).json({ error: "Operación no permitida" });
    else next(err);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const accessToken = req.accessToken;
    if (!accessToken) {
      res.status(401).json({ error: "Falta autenticación" });
      return;
    }
    await playlistService.deletePlaylist({ accessToken, id: req.params.id });
    res.status(204).end();
  } catch (err) {
    if (isRlsDenied(err)) res.status(403).json({ error: "Operación no permitida" });
    else next(err);
  }
}

const addSongBody = z.object({
  song_id: z.string().uuid(),
  position: z.number().int().positive().optional(),
});

export async function addSong(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const accessToken = req.accessToken;
    const userId = req.user?.id;
    if (!accessToken || !userId) {
      res.status(401).json({ error: "Falta autenticación" });
      return;
    }
    const body = addSongBody.parse(req.body);
    const item = await playlistService.addSongToPlaylist({
      accessToken,
      userId,
      playlistId: req.params.id,
      songId: body.song_id,
      position: body.position,
    });
    const counters = await playlistService.recalcPlaylistCounters(req.params.id);
    res.status(201).json({ item, counters });
  } catch (err) {
    if (isRlsDenied(err)) res.status(403).json({ error: "Operación no permitida" });
    else next(err);
  }
}

export async function removeSong(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const accessToken = req.accessToken;
    if (!accessToken) {
      res.status(401).json({ error: "Falta autenticación" });
      return;
    }

    const deleted = await playlistService.removeSongFromPlaylist({
      accessToken,
      playlistId: req.params.id,
      songId: req.params.song_id,
    });
    if (!deleted) {
      res.status(404).json({ error: "Canción no está en la playlist" });
      return;
    }
    const counters = await playlistService.recalcPlaylistCounters(req.params.id);
    res.json({ removed: true, counters });
  } catch (err) {
    if (isRlsDenied(err)) res.status(403).json({ error: "Operación no permitida" });
    else next(err);
  }
}
