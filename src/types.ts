export type JsonObject = Record<string, unknown>;

export interface Song {
  id: string;
  title: string;
  album: string;
  artist_id: string | null;
  genre: string | null;
  duration_seconds: number | null;
  audio_url: string;
  cover_url: string | null;
  lyrics: string | null;
  is_explicit: boolean;
  play_count: number;
  download_count: number;
  is_offline_available: boolean;
  status: string;
  is_published: boolean;
  metadata: JsonObject | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type Track = Song;

export interface Playlist {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  cover_url: string | null;
  is_public: boolean;
  is_collaborative: boolean;
  song_count: number;
  total_duration_seconds: number;
  created_at: string;
  updated_at: string;
}

export interface PlaylistSong {
  id: string;
  playlist_id: string;
  song_id: string;
  position: number | null;
  added_at: string;
  added_by: string;
}

export interface Favorite {
  id: string;
  user_id: string;
  song_id: string;
  created_at: string;
}

export interface Paginated<T> {
  data: T[];
  page: number;
  limit: number;
  total: number;
}

export interface AuthUser {
  id: string;
  email?: string;
}
