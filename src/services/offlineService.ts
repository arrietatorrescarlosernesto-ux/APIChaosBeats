import { randomUUID } from "crypto";
import { supabaseAdmin } from "../config/supabase";
import { storage } from "../storage/R2StorageService";

type OfflineSongRow = {
  id: string;
  title: string;
  genre: string | null;
  audio_url: string;
  cover_url: string | null;
  duration_seconds: number | null;
  is_published: boolean;
};

type OfflineTokenRow = {
  id: string;
  user_id: string;
  song_id: string | null;
  token: string;
  device_id: string;
  expires_at: string;
  is_revoked: boolean;
  created_at: string;
};

function toDownloadFilename(title: string, audioUrl: string): string {
  const m = audioUrl.match(/\.([a-z0-9]+)$/i);
  const ext = m?.[1] ? m[1].toLowerCase() : "mp3";
  return `${title}.${ext}`.replace(/[/\\?%*:|"<>]/g, "_");
}

export async function createOfflineTokenForSong(opts: {
  userId: string;
  songId: string;
  deviceId?: string;
}): Promise<{ token: string; expires_at: string; downloadUrl: string } | null> {
  const { userId, songId, deviceId } = opts;
  const { data: song, error: songError } = await supabaseAdmin
    .from("songs")
    .select("id,title,audio_url,is_published")
    .eq("id", songId)
    .maybeSingle();
  if (songError) throw songError;
  const songRow = song as unknown as Pick<OfflineSongRow, "id" | "title" | "audio_url" | "is_published"> | null;
  if (!songRow || !songRow.is_published) return null;

  const nowIso = new Date().toISOString();
  const { data: existing, error: existingError } = await supabaseAdmin
    .from("offline_tokens")
    .select("token,expires_at")
    .eq("user_id", userId)
    .eq("song_id", songId)
    .eq("is_revoked", false)
    .gt("expires_at", nowIso)
    .order("expires_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingError) throw existingError;

  const token = (existing as { token?: string } | null)?.token ?? randomUUID();
  const expires_at =
    (existing as { expires_at?: string } | null)?.expires_at ??
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  if (!existing) {
    const { error: insertError } = await supabaseAdmin.from("offline_tokens").insert({
      user_id: userId,
      song_id: songId,
      token,
      device_id: deviceId?.trim() ? deviceId.trim() : "unknown",
      expires_at,
      is_revoked: false,
    });
    if (insertError) throw insertError;
  }

  const filename = toDownloadFilename(songRow.title, songRow.audio_url);
  const downloadUrl = await storage.getDownloadUrl(songRow.audio_url, filename);
  return { token, expires_at, downloadUrl };
}

export async function listOffline(opts: {
  userId: string;
}): Promise<
  Array<{
    token: string;
    expires_at: string;
    id: string;
    title: string;
    genre: string | null;
    audio_url: string;
    cover_url: string | null;
    duration_seconds: number | null;
    downloadUrl: string;
  }>
> {
  const nowIso = new Date().toISOString();
  const { data: tokensData, error: tokensError } = await supabaseAdmin
    .from("offline_tokens")
    .select("song_id,token,expires_at")
    .eq("user_id", opts.userId)
    .eq("is_revoked", false)
    .gt("expires_at", nowIso)
    .order("created_at", { ascending: false });
  if (tokensError) throw tokensError;

  const tokens = (tokensData ?? []) as Array<Pick<OfflineTokenRow, "song_id" | "token" | "expires_at">>;
  const songIds = Array.from(new Set(tokens.map((t) => t.song_id).filter(Boolean))) as string[];
  if (songIds.length === 0) return [];

  const { data: songsData, error: songsError } = await supabaseAdmin
    .from("songs")
    .select("id,title,genre,audio_url,cover_url,duration_seconds,is_published")
    .in("id", songIds)
    .eq("is_published", true);
  if (songsError) throw songsError;

  const songs = (songsData ?? []) as Array<OfflineSongRow>;
  const songById = new Map<string, OfflineSongRow>();
  for (const s of songs) songById.set(s.id, s);

  const out: Array<{
    token: string;
    expires_at: string;
    id: string;
    title: string;
    genre: string | null;
    audio_url: string;
    cover_url: string | null;
    duration_seconds: number | null;
    downloadUrl: string;
  }> = [];

  for (const t of tokens) {
    if (!t.song_id) continue;
    const song = songById.get(t.song_id);
    if (!song) continue;
    const filename = toDownloadFilename(song.title, song.audio_url);
    const downloadUrl = await storage.getDownloadUrl(song.audio_url, filename);
    out.push({
      token: t.token,
      expires_at: t.expires_at,
      id: song.id,
      title: song.title,
      genre: song.genre,
      audio_url: song.audio_url,
      cover_url: song.cover_url,
      duration_seconds: song.duration_seconds,
      downloadUrl,
    });
  }

  return out;
}

export async function revokeOfflineTokensForSong(opts: {
  userId: string;
  songId: string;
}): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("offline_tokens")
    .update({ is_revoked: true })
    .eq("user_id", opts.userId)
    .eq("song_id", opts.songId)
    .eq("is_revoked", false)
    .select("id")
    .limit(1);
  if (error) throw error;
  return (data ?? []).length > 0;
}
