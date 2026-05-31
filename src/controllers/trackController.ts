import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import * as trackService from "../services/trackService";
import { storage } from "../storage/R2StorageService";

const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().min(1).optional(),
  sort: z.enum(["popular"]).optional(),
});

const adminListQuery = listQuery.extend({
  status: z.enum(["published", "draft", "all"]).default("draft"),
});

export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { page, limit, search, sort } = listQuery.parse(req.query);
    res.json(await trackService.listTracks({ page, limit, search, sort }));
  } catch (err) {
    next(err);
  }
}

export async function listAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { page, limit, search, status } = adminListQuery.parse(req.query);
    res.json(await trackService.listAdminTracks({ page, limit, search, status }));
  } catch (err) {
    next(err);
  }
}

export async function getById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const track = await trackService.getTrack(req.params.id);
    if (!track || !track.is_published) {
      res.status(404).json({ error: "Canción no disponible" });
      return;
    }
    res.json(track);
  } catch (err) {
    next(err);
  }
}

export async function adminGetById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const track = await trackService.getTrack(req.params.id);
    if (!track) {
      res.status(404).json({ error: "Canción no encontrada" });
      return;
    }
    res.json(track);
  } catch (err) {
    next(err);
  }
}

// 302 -> URL firmada de R2. El servidor NO transmite el audio (eficiencia + costo $0 de egress propio).
export async function stream(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const track = await trackService.getTrack(req.params.id);
    if (!track || !track.is_published) {
      res.status(404).json({ error: "Canción no disponible" });
      return;
    }
    res.redirect(302, await storage.getStreamUrl(track.audio_url));
  } catch (err) {
    next(err);
  }
}

export async function adminStream(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const track = await trackService.getTrack(req.params.id);
    if (!track) {
      res.status(404).json({ error: "Canción no encontrada" });
      return;
    }
    res.redirect(302, await storage.getStreamUrl(track.audio_url));
  } catch (err) {
    next(err);
  }
}

export async function download(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const track = await trackService.getTrack(req.params.id);
    if (!track || !track.is_published) {
      res.status(404).json({ error: "Canción no disponible" });
      return;
    }
    const m = track.audio_url.match(/\.([a-z0-9]+)$/i);
    const ext = m?.[1] ? m[1].toLowerCase() : "mp3";
    const filename = `${track.title}.${ext}`.replace(/[/\\?%*:|"<>]/g, "_");
    res.redirect(302, await storage.getDownloadUrl(track.audio_url, filename));
  } catch (err) {
    next(err);
  }
}

const createBody = z.object({
  title: z.string().min(1),
  album: z.string().trim().min(1).optional(),
  artistId: z.string().uuid().optional(),
  genre: z.string().trim().min(1).optional(),
  durationSeconds: z.number().int().positive().optional(),
  contentType: z.enum(["audio/mpeg", "audio/wav"]).default("audio/mpeg"),
});

// Admin: crea el registro y devuelve { track, uploadUrl } para subir el archivo directo a R2.
export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = createBody.parse(req.body);
    const createdBy = req.user?.id;
    if (!createdBy) {
      res.status(401).json({ error: "Falta autenticación" });
      return;
    }
    const result = await trackService.createTrackForUpload({ ...body, createdBy });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

// Admin: marca la canción como publicada una vez subido el archivo.
export async function publish(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const track = await trackService.publishTrack(req.params.id);
    if (!track) {
      res.status(404).json({ error: "Canción no encontrada" });
      return;
    }
    res.json(track);
  } catch (err) {
    next(err);
  }
}

export async function play(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user?.id) {
      res.status(401).json({ error: "Falta autenticación" });
      return;
    }
    const playCount = await trackService.incrementPlayCount(req.params.id);
    if (playCount === null) {
      res.status(404).json({ error: "Canción no disponible" });
      return;
    }
    res.json({ play_count: playCount });
  } catch (err) {
    next(err);
  }
}
