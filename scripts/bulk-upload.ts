import dotenv from "dotenv";
import { readFile, readdir, stat } from "fs/promises";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

dotenv.config();

type ClaudeItem = { filename: string; title: string; artist: string };
type Confidence = "alta" | "media" | "baja";
let claudeLoggedConfig = false;
let claudeLoggedFirstRaw = false;

function getArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  if (hit) return hit.slice(prefix.length);
  return undefined;
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Falta ${name} en el entorno`);
  return v;
}

function sanitizeKeyPart(input: string): string {
  const noAccents = input.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const trimmed = noAccents.trim().toLowerCase();
  const dashed = trimmed.replace(/\s+/g, "-");
  return dashed.replace(/[^a-z0-9-]/g, "");
}

function sanitizeFilename(input: string): string {
  return input.replace(/[/\\?%*:|"<>]/g, "_");
}

function stripExtension(filename: string): string {
  return filename.replace(/\.[^.]+$/, "");
}

function basicParse(filename: string): { title: string; artist: string; confidence: Confidence } {
  const raw = stripExtension(filename);
  const cleaned = raw
    .replace(/\(.*?\)/g, " ")
    .replace(/[_]+/g, " ")
    .replace(/-+/g, "-")
    .replace(/\s+/g, " ")
    .trim();

  const parts = cleaned.split("-").map((p) => p.trim()).filter(Boolean);
  const last = parts.at(-1) ?? "";
  const lastIsId = /^\d{4,}$/.test(last);
  if (lastIsId && parts.length >= 3) {
    const artist = parts[0] || "Desconocido";
    const title = parts.slice(1, -1).join(" ").replace(/\s+/g, " ").trim() || cleaned;
    return { title, artist, confidence: "baja" };
  }

  const title = cleaned.replace(/[-]/g, " ").replace(/\s+/g, " ").trim() || raw;
  return { title, artist: "Desconocido", confidence: "baja" };
}

async function listMp3Files(rootDir: string) {
  const out: Array<{ fullPath: string; relDir: string; filename: string }> = [];
  async function walk(dir: string) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        await walk(full);
        continue;
      }
      if (e.isFile() && e.name.toLowerCase().endsWith(".mp3")) {
        const relDir = path.relative(rootDir, path.dirname(full));
        out.push({ fullPath: full, relDir, filename: e.name });
      }
    }
  }
  await walk(rootDir);
  return out;
}

async function claudeBatchParse(opts: {
  apiKey: string;
  model: string;
  filenames: string[];
}): Promise<Map<string, { title: string; artist: string; confidence: Confidence }>> {
  const { apiKey, model, filenames } = opts;
  const prompt =
    'Devuelve SOLO un JSON array (sin markdown) de objetos {"filename","title","artist","confidence"} para estos filenames.\n' +
    'title: limpio/legible (quita extensión, ids numéricos, "(Official)", "_" -> espacio, "-" -> espacio).\n' +
    'artist: identifica artista real SOLO si es claro; si no, "Desconocido". No inventes.\n' +
    'confidence: "alta"|"media"|"baja" (si artist="Desconocido" => "baja").\n' +
    'Ejemplo: [{"filename":"artista-titulo-123.mp3","title":"titulo","artist":"artista","confidence":"media"}]\n' +
    filenames.join("\n");

  const maxTokens = Math.min(4000, Math.max(800, filenames.length * 120));

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature: 0,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  process.stdout.write(`[CLAUDE] HTTP ${res.status} (batch=${filenames.length}, max_tokens=${maxTokens}, model=${model})\n`);
  if (!res.ok) {
    const body = await res.text();
    process.stdout.write(`[CLAUDE] ERROR BODY\n${body}\n`);
    throw new Error(`Claude HTTP ${res.status}`);
  }
  const json = (await res.json()) as unknown as { content?: Array<{ type: string; text?: string }> };
  const text = json.content?.find((c) => c.type === "text")?.text ?? "";
  if (!claudeLoggedFirstRaw) {
    claudeLoggedFirstRaw = true;
    process.stdout.write(`[CLAUDE] FIRST RAW TEXT\n${text}\n`);
  }
  const unfenced = text.replace(/```[a-z]*\s*/gi, "").replace(/```/g, "").trim();
  const start = unfenced.indexOf("[");
  const end = unfenced.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) throw new Error("Claude devolvió texto no parseable como JSON array");
  const arr = JSON.parse(unfenced.slice(start, end + 1)) as Array<
    ClaudeItem & { confidence?: Confidence | string }
  >;

  const out = new Map<string, { title: string; artist: string; confidence: Confidence }>();
  for (const item of arr) {
    if (!item?.filename || !item?.title || !item?.artist) continue;
    const confidenceRaw = String(item.confidence ?? "").toLowerCase();
    const confidence: Confidence =
      confidenceRaw === "alta" || confidenceRaw === "media" || confidenceRaw === "baja"
        ? (confidenceRaw as Confidence)
        : item.artist === "Desconocido"
          ? "baja"
          : "media";
    out.set(item.filename, { title: String(item.title), artist: String(item.artist), confidence });
  }
  return out;
}

async function main() {
  const rootDir = getArg("dir") ?? process.env.CATALOG_DIR ?? "D:\\API\\canciones";
  const st = await stat(rootDir).catch(() => null);
  if (!st || !st.isDirectory()) throw new Error(`No existe el directorio: ${rootDir}`);

  const supabaseUrl = requireEnv("SUPABASE_URL");
  const supabaseServiceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const adminProfileId = requireEnv("ADMIN_PROFILE_ID");

  const r2Endpoint = requireEnv("R2_ENDPOINT");
  const r2AccessKeyId = requireEnv("R2_ACCESS_KEY_ID");
  const r2SecretAccessKey = requireEnv("R2_SECRET_ACCESS_KEY");
  const r2Bucket = requireEnv("R2_BUCKET");

  const anthropicApiKey = process.env.ANTHROPIC_API_KEY ?? "";
  const anthropicModel = process.env.ANTHROPIC_MODEL ?? "claude-3-haiku-20240307";
  if (!claudeLoggedConfig) {
    claudeLoggedConfig = true;
    process.stdout.write(`[CLAUDE] model=${anthropicModel} apiKeyPresente=${Boolean(anthropicApiKey)}\n`);
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const s3 = new S3Client({
    region: "auto",
    endpoint: r2Endpoint,
    credentials: { accessKeyId: r2AccessKeyId, secretAccessKey: r2SecretAccessKey },
  });

  const existing = new Set<string>();
  {
    const { data, error } = await supabaseAdmin.from("songs").select("audio_url");
    if (error) throw error;
    const rows = (data ?? []) as Array<{ audio_url?: string | null }>;
    for (const r of rows) if (r.audio_url) existing.add(r.audio_url);
  }

  const allFiles = await listMp3Files(rootDir);
  const totalFound = allFiles.length;
  if (totalFound === 0) {
    process.stdout.write("No se encontraron .mp3\n");
    return;
  }

  const files = allFiles
    .map((f) => {
      const genreLegible = f.relDir && f.relDir !== "." ? f.relDir.split(path.sep)[0] : "Otras";
      const genreKey = sanitizeKeyPart(genreLegible || "otras") || "otras";
      const key = `songs/${genreKey}/${sanitizeFilename(f.filename)}`;
      return { ...f, genreLegible, genreKey, key };
    })
    .filter((f) => !existing.has(f.key));

  const skippedInitial = totalFound - files.length;
  process.stdout.write(`${skippedInitial} ya existen, se omiten; procesando ${files.length} nuevos\n`);

  const total = files.length;
  if (total === 0) {
    process.stdout.write("No hay archivos nuevos por subir.\n");
    return;
  }

  let ok = 0;
  let skipped = skippedInitial;
  let failed = 0;
  let unknownArtist = 0;
  const failures: Array<{ file: string; reason: string }> = [];

  const filenameToMeta = new Map<string, { title: string; artist: string; confidence: Confidence }>();
  if (anthropicApiKey) {
    const batchSize = 40;
    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize).map((f) => f.filename);
      try {
        const parsed = await claudeBatchParse({ apiKey: anthropicApiKey, model: anthropicModel, filenames: batch });
        for (const [k, v] of parsed.entries()) filenameToMeta.set(k, v);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        process.stdout.write(`[FALLBACK] Claude falló, usando regex (${message})\n`);
        for (const name of batch) filenameToMeta.set(name, basicParse(name));
      }
    }
  } else {
    process.stdout.write("[FALLBACK] ANTHROPIC_API_KEY ausente, usando regex\n");
    for (const f of files) filenameToMeta.set(f.filename, basicParse(f.filename));
  }

  for (let idx = 0; idx < files.length; idx++) {
    const f = files[idx];

    process.stdout.write(`[${idx + 1}/${total}] ${f.filename}\n`);

    if (existing.has(f.key)) {
      skipped++;
      continue;
    }

    const meta = filenameToMeta.get(f.filename) ?? basicParse(f.filename);
    if (meta.artist === "Desconocido") unknownArtist++;

    try {
      const bytes = await readFile(f.fullPath);
      const put = await s3.send(
        new PutObjectCommand({
          Bucket: r2Bucket,
          Key: f.key,
          Body: bytes,
          ContentType: "audio/mpeg",
        }),
      );

      const { error: insertError } = await supabaseAdmin.from("songs").insert({
        title: meta.title,
        genre: f.genreLegible,
        audio_url: f.key,
        is_published: true,
        created_by: adminProfileId,
        artist_id: null,
        metadata: {
          artist: meta.artist,
          confidence: meta.confidence,
          source: "stock",
          original_filename: f.filename,
          r2_etag: put.ETag ?? null,
        },
      });
      if (insertError) throw insertError;

      existing.add(f.key);
      ok++;
    } catch (err) {
      failed++;
      const reason = err instanceof Error ? err.message : String(err);
      failures.push({ file: f.fullPath, reason });
      process.stderr.write(`FAIL ${f.fullPath}\n${reason}\n`);
    }
  }

  process.stdout.write("\nResumen\n");
  process.stdout.write(`Total: ${total}\n`);
  process.stdout.write(`OK: ${ok}\n`);
  process.stdout.write(`Saltadas: ${skipped}\n`);
  process.stdout.write(`Fallidas: ${failed}\n`);
  process.stdout.write(`Artist=Desconocido: ${unknownArtist}\n`);
  if (failures.length) {
    process.stdout.write("\nFallos\n");
    for (const f of failures) process.stdout.write(`${f.file}\n${f.reason}\n`);
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(message);
  process.exit(1);
});
