import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { readFile } from "fs/promises";

dotenv.config();

type StepResult = { name: string; ok: boolean; details?: string };

function getArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  if (hit) return hit.slice(prefix.length);
  return undefined;
}

function normalizeBaseUrl(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

function fail(msg: string): never {
  throw new Error(msg);
}

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) fail("Faltan SUPABASE_URL o SUPABASE_ANON_KEY en el .env");

  const email = getArg("email") ?? process.env.ADMIN_EMAIL;
  const password = getArg("password") ?? process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    fail("Faltan credenciales. Usa --email=... --password=... o define ADMIN_EMAIL y ADMIN_PASSWORD.");
  }

  const baseUrl = normalizeBaseUrl(getArg("baseUrl") ?? process.env.API_BASE_URL ?? "http://localhost:3000");
  const mp3Path = getArg("mp3") ?? process.env.E2E_MP3_PATH;
  if (!mp3Path) fail("Falta la ruta al mp3. Usa --mp3=RUTA o define E2E_MP3_PATH.");

  const results: StepResult[] = [];
  let token = "";
  let trackId = "";
  let uploadUrl = "";
  let playlistId = "";

  async function step(name: string, fn: () => Promise<void>) {
    try {
      await fn();
      results.push({ name, ok: true });
      process.stdout.write(`[OK] ${name}\n`);
    } catch (err) {
      const details = err instanceof Error ? err.message : String(err);
      results.push({ name, ok: false, details });
      process.stdout.write(`[FALLO] ${name}: ${details}\n`);
      throw err;
    }
  }

  await step("1) Login admin", async () => {
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    if (!data.session?.access_token) fail("No se pudo obtener access_token");
    token = data.session.access_token;
  });

  await step("2) GET /health", async () => {
    const res = await fetch(`${baseUrl}/health`);
    if (!res.ok) fail(`HTTP ${res.status}`);
    const body = (await res.json()) as unknown as { status?: string };
    if (body.status !== "ok") fail(`Respuesta inesperada: ${JSON.stringify(body)}`);
  });

  await step("3) POST /api/tracks (admin) -> uploadUrl", async () => {
    const res = await fetch(`${baseUrl}/api/tracks`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ title: `E2E ${Date.now()}`, contentType: "audio/mpeg" }),
    });
    if (res.status !== 201) fail(`HTTP ${res.status}: ${await res.text()}`);
    const body = (await res.json()) as unknown as {
      track?: { id?: string };
      uploadUrl?: string;
    };
    if (!body.track?.id) fail("Falta track.id en respuesta");
    if (!body.uploadUrl) fail("Falta uploadUrl en respuesta");
    trackId = body.track.id;
    uploadUrl = body.uploadUrl;
  });

  await step("4) PUT mp3 -> uploadUrl", async () => {
    const bytes = await readFile(mp3Path);
    const res = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": "audio/mpeg" },
      body: bytes,
    });
    if (res.status < 200 || res.status >= 300) fail(`HTTP ${res.status}: ${await res.text()}`);
  });

  await step("5) POST /api/tracks/:id/publish (admin)", async () => {
    const res = await fetch(`${baseUrl}/api/tracks/${trackId}/publish`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) fail(`HTTP ${res.status}: ${await res.text()}`);
    const body = (await res.json()) as unknown as { is_published?: boolean };
    if (body.is_published !== true) fail(`is_published != true: ${JSON.stringify(body)}`);
  });

  await step("6) GET /api/tracks/:id (público)", async () => {
    const res = await fetch(`${baseUrl}/api/tracks/${trackId}`);
    if (!res.ok) fail(`HTTP ${res.status}: ${await res.text()}`);
  });

  await step("7) GET /api/tracks/:id/stream -> 302 Location", async () => {
    const res = await fetch(`${baseUrl}/api/tracks/${trackId}/stream`, { redirect: "manual" });
    if (res.status !== 302) fail(`HTTP ${res.status}`);
    const location = res.headers.get("location");
    if (!location) fail("Falta header Location");
    if (!/^https?:\/\//i.test(location)) fail(`Location inválido: ${location}`);
  });

  await step("8) GET /api/admin/tracks?status=draft (admin)", async () => {
    const res = await fetch(`${baseUrl}/api/admin/tracks?status=draft&page=1&limit=20`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) fail(`HTTP ${res.status}: ${await res.text()}`);
  });

  await step("9) POST /api/playlists (crear)", async () => {
    const res = await fetch(`${baseUrl}/api/playlists`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: `E2E Playlist ${Date.now()}`, is_public: false, is_collaborative: false }),
    });
    if (res.status !== 201) fail(`HTTP ${res.status}: ${await res.text()}`);
    const body = (await res.json()) as unknown as { id?: string };
    if (!body.id) fail("Falta playlist.id en respuesta");
    playlistId = body.id;
  });

  await step("10) GET /api/playlists/me (aparece playlist)", async () => {
    const res = await fetch(`${baseUrl}/api/playlists/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) fail(`HTTP ${res.status}: ${await res.text()}`);
    const body = (await res.json()) as unknown as Array<{ id?: string }>;
    if (!Array.isArray(body)) fail("Respuesta inesperada (no array)");
    if (!body.some((p) => p.id === playlistId)) fail("La playlist creada no aparece en /me");
  });

  await step("11) POST /api/playlists/:id/songs (agregar song)", async () => {
    const res = await fetch(`${baseUrl}/api/playlists/${playlistId}/songs`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ song_id: trackId }),
    });
    if (res.status < 200 || res.status >= 300) fail(`HTTP ${res.status}: ${await res.text()}`);
  });

  await step("12) GET /api/playlists/:id (song_count == 1)", async () => {
    const res = await fetch(`${baseUrl}/api/playlists/${playlistId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) fail(`HTTP ${res.status}: ${await res.text()}`);
    const body = (await res.json()) as unknown as {
      playlist?: { song_count?: number; total_duration_seconds?: number | null };
      songs?: Array<{ song_id?: string }>;
    };
    if (!body.playlist) fail("Falta playlist en respuesta");
    if (body.playlist.song_count !== 1) fail(`song_count != 1: ${JSON.stringify(body.playlist)}`);
    if (!Array.isArray(body.songs)) fail("Falta songs[] en respuesta");
    if (!body.songs.some((s) => s.song_id === trackId)) fail("La canción no aparece en la playlist");
    process.stdout.write(`INFO total_duration_seconds=${body.playlist.total_duration_seconds ?? "null"}\n`);
  });

  await step("13) POST /api/favorites (idempotente)", async () => {
    const run = async () => {
      const res = await fetch(`${baseUrl}/api/favorites`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ song_id: trackId }),
      });
      if (res.status < 200 || res.status >= 300) fail(`HTTP ${res.status}: ${await res.text()}`);
    };
    await run();
    await run();
  });

  await step("14) GET /api/favorites (song aparece)", async () => {
    const res = await fetch(`${baseUrl}/api/favorites`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) fail(`HTTP ${res.status}: ${await res.text()}`);
    const body = (await res.json()) as unknown as Array<{ song_id?: string }>;
    if (!Array.isArray(body)) fail("Respuesta inesperada (no array)");
    if (!body.some((f) => f.song_id === trackId)) fail("La canción no aparece en favoritos");
  });

  await step("15) DELETE /api/playlists/:id/songs/:song_id (song_count == 0)", async () => {
    const del = await fetch(`${baseUrl}/api/playlists/${playlistId}/songs/${trackId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (del.status < 200 || del.status >= 300) fail(`HTTP ${del.status}: ${await del.text()}`);

    const res = await fetch(`${baseUrl}/api/playlists/${playlistId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) fail(`HTTP ${res.status}: ${await res.text()}`);
    const body = (await res.json()) as unknown as { playlist?: { song_count?: number } };
    if (!body.playlist) fail("Falta playlist en respuesta");
    if (body.playlist.song_count !== 0) fail(`song_count != 0: ${JSON.stringify(body.playlist)}`);
  });

  await step("16) DELETE /api/favorites/:song_id (ya no está)", async () => {
    const del = await fetch(`${baseUrl}/api/favorites/${trackId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (del.status < 200 || del.status >= 300) fail(`HTTP ${del.status}: ${await del.text()}`);

    const res = await fetch(`${baseUrl}/api/favorites`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) fail(`HTTP ${res.status}: ${await res.text()}`);
    const body = (await res.json()) as unknown as Array<{ song_id?: string }>;
    if (!Array.isArray(body)) fail("Respuesta inesperada (no array)");
    if (body.some((f) => f.song_id === trackId)) fail("La canción sigue apareciendo en favoritos");
  });

  await step("17) DELETE /api/playlists/:id (limpieza)", async () => {
    const res = await fetch(`${baseUrl}/api/playlists/${playlistId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status !== 204) fail(`HTTP ${res.status}: ${await res.text()}`);
  });

  process.stdout.write("\nResumen\n");
  for (const r of results) process.stdout.write(`${r.ok ? "PASS" : "FAIL"} ${r.name}\n`);
  process.stdout.write(`\nTrack creado: ${trackId}\n`);
  process.stdout.write(`Playlist creada: ${playlistId}\n`);
}

main().catch((e) => {
  console.error("ERROR e2e:", e);
  process.exit(1);
});
