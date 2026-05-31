import { supabaseForUser } from "../config/supabase";

export async function listFavorites(opts: { accessToken: string; userId: string }) {
  const { accessToken, userId } = opts;
  const { data, error } = await supabaseForUser(accessToken)
    .from("favorites")
    .select("id,created_at,song_id,songs(id,title,duration_seconds,audio_url,cover_url,is_published)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function addFavorite(opts: { accessToken: string; userId: string; songId: string }) {
  const { accessToken, userId, songId } = opts;
  const client = supabaseForUser(accessToken);

  const { data: existing, error: existingError } = await client
    .from("favorites")
    .select("id,created_at,song_id")
    .eq("user_id", userId)
    .eq("song_id", songId)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) return { favorite: existing, created: false };

  const { data, error } = await client
    .from("favorites")
    .insert({ user_id: userId, song_id: songId })
    .select("id,created_at,song_id")
    .single();

  if (error) {
    const code = (error as unknown as { code?: string }).code;
    if (code === "23505") {
      const { data: again, error: againError } = await client
        .from("favorites")
        .select("id,created_at,song_id")
        .eq("user_id", userId)
        .eq("song_id", songId)
        .maybeSingle();
      if (againError) throw againError;
      if (again) return { favorite: again, created: false };
    }
    throw error;
  }

  return { favorite: data, created: true };
}

export async function removeFavorite(opts: { accessToken: string; userId: string; songId: string }) {
  const { accessToken, userId, songId } = opts;
  const { data, error } = await supabaseForUser(accessToken)
    .from("favorites")
    .delete()
    .eq("user_id", userId)
    .eq("song_id", songId)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  return data;
}
