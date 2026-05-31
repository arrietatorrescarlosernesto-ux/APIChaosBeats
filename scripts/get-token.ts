import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

function getArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  if (hit) return hit.slice(prefix.length);
  return undefined;
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("Faltan SUPABASE_URL o SUPABASE_ANON_KEY en el .env");

  const email = getArg("email") ?? process.env.ADMIN_EMAIL;
  const password = getArg("password") ?? process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error(
      "Faltan credenciales. Usa --email=... --password=... o define ADMIN_EMAIL y ADMIN_PASSWORD.",
    );
  }

  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  if (!data.session?.access_token) throw new Error("No se pudo obtener access_token");

  process.stdout.write(data.session.access_token);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(message);
  process.exit(1);
});
