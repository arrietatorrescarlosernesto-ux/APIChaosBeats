-- =====================================================================
-- Chaos Beats — Music API · Esquema PostgreSQL (Supabase)
-- Plano de control: usuarios (Supabase Auth) + metadata.
-- Los ARCHIVOS de audio NO viven aquí: viven en Cloudflare R2.
-- La tabla `tracks` solo guarda `storage_key` (el objeto en R2).
-- =====================================================================

create extension if not exists pg_trgm;  -- búsqueda eficiente con ILIKE

create table artists (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  image_key   text,                       -- objeto en R2 (opcional)
  created_at  timestamptz not null default now()
);

create table albums (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  artist_id   uuid references artists(id) on delete set null,
  cover_key   text,
  released_at date,
  created_at  timestamptz not null default now()
);

create table tracks (
  id               uuid primary key default gen_random_uuid(),
  title            text not null,
  artist_id        uuid references artists(id) on delete set null,
  album_id         uuid references albums(id) on delete set null,
  duration_seconds int,
  storage_key      text not null,             -- << puntero al objeto en R2
  content_type     text not null default 'audio/mpeg',
  is_published     boolean not null default false,
  play_count       bigint not null default 0,
  created_at       timestamptz not null default now()
);

create table playlists (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  is_public   boolean not null default false,
  created_at  timestamptz not null default now()
);

create table playlist_tracks (
  playlist_id uuid not null references playlists(id) on delete cascade,
  track_id    uuid not null references tracks(id) on delete cascade,
  position    int,
  added_at    timestamptz not null default now(),
  primary key (playlist_id, track_id)
);

-- ---------- Índices (eficiencia) ----------
create index idx_tracks_artist     on tracks(artist_id);
create index idx_tracks_album      on tracks(album_id);
create index idx_tracks_published  on tracks(is_published) where is_published = true;
create index idx_tracks_title_trgm on tracks using gin (title gin_trgm_ops);
create index idx_artists_name_trgm on artists using gin (name gin_trgm_ops);
create index idx_playlists_user    on playlists(user_id);
create index idx_pltracks_playlist on playlist_tracks(playlist_id);

-- ---------- RLS ----------
-- Catálogo (tracks/albums/artists): lectura pública; escritura solo vía service_role (API admin).
alter table tracks  enable row level security;
alter table albums  enable row level security;
alter table artists enable row level security;
create policy "catalogo lectura publica" on tracks  for select using (is_published);
create policy "albums lectura publica"   on albums  for select using (true);
create policy "artists lectura publica"  on artists for select using (true);

-- Playlists: cada quien las suyas (o públicas).
alter table playlists       enable row level security;
alter table playlist_tracks enable row level security;

create policy "playlists select" on playlists
  for select using (auth.uid() = user_id or is_public);
create policy "playlists modify" on playlists
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "pltracks select" on playlist_tracks
  for select using (exists (
    select 1 from playlists p
    where p.id = playlist_id and (p.user_id = auth.uid() or p.is_public)));
create policy "pltracks modify" on playlist_tracks
  for all using (exists (
    select 1 from playlists p where p.id = playlist_id and p.user_id = auth.uid()))
  with check (exists (
    select 1 from playlists p where p.id = playlist_id and p.user_id = auth.uid()));

-- ---------- Almacenamiento (Cloudflare R2) ----------
-- Crear un bucket PRIVADO llamado "chaosbeats-audio".
-- El acceso se da SIEMPRE por presigned URLs generadas por la API (no público).
-- Estructura de llaves sugerida:  tracks/<uuid>.mp3

-- =====================================================================
-- Perfiles de usuario y redes sociales
-- =====================================================================

create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  username    text unique,
  display_name text,
  bio         text,
  avatar_url  text,
  location    text,
  website     text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table social_links (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id) on delete cascade,
  platform    text not null,
  url         text not null,
  display_order int not null default 0,
  created_at  timestamptz not null default now(),
  unique(user_id, platform)
);

create index idx_profiles_username on profiles(username);
create index idx_social_links_user on social_links(user_id);

alter table profiles enable row level security;
alter table social_links enable row level security;

create policy "profiles select" on profiles for select using (true);
create policy "profiles modify own" on profiles for all using (auth.uid() = id) with check (auth.uid() = id);

create policy "social_links select" on social_links for select using (true);
create policy "social_links modify own" on social_links for all
  using (exists (select 1 from profiles p where p.id = user_id and p.id = auth.uid()))
  with check (exists (select 1 from profiles p where p.id = user_id and p.id = auth.uid()));

-- Trigger para crear perfil automáticamente al registrar usuario
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username, display_name)
  values (new.id, new.raw_user_meta_data->>'username', new.raw_user_meta_data->>'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
