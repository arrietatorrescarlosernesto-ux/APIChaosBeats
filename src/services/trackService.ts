import { randomUUID } from "crypto";
import { supabaseAdmin } from "../config/supabase";
import { storage } from "../storage/R2StorageService";
import { Track, Paginated } from "../types";

const SONG_COLUMNS =
  "id,title,album,artist_id,genre,duration_seconds,audio_url,cover_url,lyrics,is_explicit,play_count,download_count,is_offline_available,status,is_published,metadata,created_by,created_at,updated_at";

type PublishedStatus = "published" | "draft" | "all";

async function listTracksByStatus(opts: {
  page: number;
  limit: number;
  search?: string;
  status: PublishedStatus;
}): Promise<Paginated<Track>> {
  const { page, limit, search, status } = opts;
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  // count "estimated": evita el COUNT exacto (caro) en tablas grandes.
  let query = supabaseAdmin.from("songs").select(SONG_COLUMNS, { count: "estimated" });

  if (status === "published") query = query.eq("is_published", true);
  if (status === "draft") query = query.eq("is_published", false);

  if (search) query = query.ilike("title", `%${search}%`);

  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) throw error;
  return { data: (data ?? []) as unknown as Track[], page, limit, total: count ?? 0 };
}

export async function listTracks(opts: {
  page: number;
  limit: number;
  search?: string;
}): Promise<Paginated<Track>> {
  return listTracksByStatus({ ...opts, status: "published" });
}

export async function listDraftTracks(opts: {
  page: number;
  limit: number;
  search?: string;
}): Promise<Paginated<Track>> {
  return listTracksByStatus({ ...opts, status: "draft" });
}

export async function listAdminTracks(opts: {
  page: number;
  limit: number;
  search?: string;
  status?: PublishedStatus;
}): Promise<Paginated<Track>> {
  return listTracksByStatus({ ...opts, status: opts.status ?? "draft" });
}

export async function getTrack(id: string): Promise<Track | null> {
  const { data, error } = await supabaseAdmin
    .from("songs")
    .select(SONG_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as Track) ?? null;
}

// Crea el registro y devuelve una URL firmada para que el admin SUBA el .mp3
// directo a R2 (el archivo nunca pasa por el servidor).
export async function createTrackForUpload(input: {
  title: string;
  album?: string;
  artistId?: string;
  genre?: string;
  durationSeconds?: number;
  contentType: string;
  createdBy: string;
}): Promise<{ track: Track; uploadUrl: string }> {
  const ext = input.contentType === "audio/wav" ? "wav" : "mp3";
  const storageKey = `tracks/${randomUUID()}.${ext}`;

  const { data, error } = await supabaseAdmin
    .from("songs")
    .insert({
      title: input.title,
      album: input.album ?? null,
      artist_id: input.artistId ?? null,
      genre: input.genre ?? null,
      duration_seconds: input.durationSeconds ?? null,
      audio_url: storageKey,
      metadata: { content_type: input.contentType },
      created_by: input.createdBy,
      is_published: false,
    })
    .select(SONG_COLUMNS)
    .single();
  if (error) throw error;

  const uploadUrl = await storage.getUploadUrl(storageKey, input.contentType);
  return { track: data as unknown as Track, uploadUrl };
}

export async function publishTrack(id: string): Promise<Track | null> {
  const { data, error } = await supabaseAdmin
    .from("songs")
    .update({ is_published: true })
    .eq("id", id)
    .select(SONG_COLUMNS)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as Track) ?? null;
}
