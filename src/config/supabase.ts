import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { env } from "./env";

if (!(globalThis as unknown as { WebSocket?: unknown }).WebSocket) {
  (globalThis as unknown as { WebSocket?: unknown }).WebSocket = WebSocket;
}

// Cliente con SERVICE ROLE: catálogo y operaciones administrativas (omite RLS).
// Nunca se expone al cliente; vive solo en el servidor.
export const supabaseAdmin = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false }, realtime: { transport: WebSocket } },
);

// Cliente con el contexto del usuario: RESPETA RLS.
// Úsalo para playlists/favoritos (cuando se agreguen).
export function supabaseForUser(accessToken: string) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { transport: WebSocket },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}
