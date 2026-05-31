import { supabaseAdmin, supabaseForUser } from "../config/supabase";

export type PlaylistStatus = "published" | "draft" | "all";

export interface PlaylistInput {
  name: string;
  description?: string;
  cover_url?: string;
  is_public?: boolean;
  is_collaborative?: boolean;
}

export interface PlaylistPatch {
  name?: string;
  description?: string | null;
  cover_url?: string | null;
  is_public?: boolean;
  is_collaborative?: boolean;
}

export async function createPlaylist(opts: {
  accessToken: string;
  userId: string;
  input: PlaylistInput;
}) {
  const { accessToken, userId, input } = opts;
  const { data, error } = await supabaseForUser(accessToken)
    .from("playlists")
    .insert({
      owner_id: userId,
      name: input.name,
      description: input.description ?? null,
      cover_url: input.cover_url ?? null,
      is_public: input.is_public ?? false,
      is_collaborative: input.is_collaborative ?? false,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function listMyPlaylists(opts: { accessToken: string; userId: string }) {
  const { accessToken, userId } = opts;
  const { data, error } = await supabaseForUser(accessToken)
    .from("playlists")
    .select("*")
    .eq("owner_id", userId)
    .order("updated_at", { ascending: false, nullsFirst: false });
  if (error) throw error;
  return data ?? [];
}

export async function getPlaylist(opts: { accessToken: string; id: string }) {
  const { accessToken, id } = opts;
  const { data, error } = await supabaseForUser(accessToken)
    .from("playlists")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getPlaylistSongs(opts: { accessToken: string; playlistId: string }) {
  const { accessToken, playlistId } = opts;
  const { data, error } = await supabaseForUser(accessToken)
    .from("playlist_songs")
    .select(
      "id,playlist_id,song_id,position,added_at,added_by,songs(id,title,duration_seconds,audio_url,cover_url,is_published)",
    )
    .eq("playlist_id", playlistId)
    .order("position", { ascending: true, nullsFirst: true });
  if (error) throw error;
  return data ?? [];
}

export async function patchPlaylist(opts: { accessToken: string; id: string; patch: PlaylistPatch }) {
  const { accessToken, id, patch } = opts;
  const { data, error } = await supabaseForUser(accessToken)
    .from("playlists")
    .update(patch)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function deletePlaylist(opts: { accessToken: string; id: string }) {
  const { accessToken, id } = opts;
  const { error } = await supabaseForUser(accessToken).from("playlists").delete().eq("id", id);
  if (error) throw error;
}

export async function addSongToPlaylist(opts: {
  accessToken: string;
  userId: string;
  playlistId: string;
  songId: string;
  position?: number;
}) {
  const { accessToken, userId, playlistId, songId, position } = opts;
  const client = supabaseForUser(accessToken);

  const { data: existing, error: existingError } = await client
    .from("playlist_songs")
    .select("id,playlist_id,song_id,position,added_at,added_by")
    .eq("playlist_id", playlistId)
    .eq("song_id", songId)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) return existing;

  let finalPosition = position;
  if (finalPosition == null) {
    const { data: maxRow, error: maxError } = await client
      .from("playlist_songs")
      .select("position")
      .eq("playlist_id", playlistId)
      .order("position", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    if (maxError) throw maxError;
    finalPosition = (maxRow?.position ?? 0) + 1;
  }

  const { data, error } = await client
    .from("playlist_songs")
    .insert({
      playlist_id: playlistId,
      song_id: songId,
      position: finalPosition,
      added_by: userId,
    })
    .select("id,playlist_id,song_id,position,added_at,added_by")
    .single();
  if (error) throw error;
  return data;
}

export async function removeSongFromPlaylist(opts: {
  accessToken: string;
  playlistId: string;
  songId: string;
}) {
  const { accessToken, playlistId, songId } = opts;
  const { data, error } = await supabaseForUser(accessToken)
    .from("playlist_songs")
    .delete()
    .eq("playlist_id", playlistId)
    .eq("song_id", songId)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function recalcPlaylistCounters(playlistId: string) {
  const { count, error: countError } = await supabaseAdmin
    .from("playlist_songs")
    .select("id", { count: "exact", head: true })
    .eq("playlist_id", playlistId);
  if (countError) throw countError;

  const { data: rows, error: rowsError } = await supabaseAdmin
    .from("playlist_songs")
    .select("songs(duration_seconds)")
    .eq("playlist_id", playlistId);
  if (rowsError) throw rowsError;

  const totalDurationSeconds =
    (rows ?? []).reduce((acc, r) => {
      const d = (r as unknown as { songs?: { duration_seconds?: number | null } | null })?.songs
        ?.duration_seconds;
      return acc + (d ?? 0);
    }, 0) ?? 0;

  const { data: updated, error: updateError } = await supabaseAdmin
    .from("playlists")
    .update({
      song_count: count ?? 0,
      total_duration_seconds: totalDurationSeconds,
    })
    .eq("id", playlistId)
    .select("id,song_count,total_duration_seconds,updated_at")
    .maybeSingle();
  if (updateError) throw updateError;

  return updated;
}
