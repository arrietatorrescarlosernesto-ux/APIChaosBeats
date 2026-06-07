# Chaos Beats — Music API

API de música self-hosted. Arquitectura de **dos planos**:

- **Plano de control** → Supabase (Auth + Postgres con la metadata). Ligero.
- **Plano de datos** → Cloudflare R2 (los archivos `.mp3`/`.wav`). Egress $0.

El servidor **nunca transmite el audio**: solo genera URLs firmadas y hace `302 redirect`.
El cliente reproduce/sube **directo a R2**. Eso mantiene el costo de traslado en cero
y hace la API eficiente (no es cuello de botella ni paga ancho de banda).

> Donativos (Stripe/PayPal) quedan **fuera por ahora**, pendientes del registro ante el SAT.

## Estructura

```
chaosbeats-music-api/
├─ src/
│  ├─ config/
│  │  ├─ env.ts             # carga + valida variables de entorno (zod)
│  │  └─ supabase.ts        # clientes Supabase (admin + por-usuario con RLS)
│  ├─ storage/
│  │  ├─ StorageService.ts  # EL PUENTE (interfaz, agnóstico de proveedor)
│  │  └─ R2StorageService.ts# implementación Cloudflare R2 (S3-compatible)
│  ├─ middlewares/
│  │  └─ auth.ts            # verifica JWT de Supabase (local) + rol admin
│  ├─ services/
│  │  └─ trackService.ts    # lógica de datos + generación de URLs firmadas
│  ├─ controllers/
│  │  └─ trackController.ts # request/response + validación (zod)
│  ├─ routes/
│  │  └─ trackRoutes.ts     # endpoints
│  ├─ types.ts
│  ├─ app.ts                # Express + manejo de errores
│  └─ server.ts             # arranque
├─ schema.sql               # Postgres (Supabase): tablas + storage_key + RLS + índices
├─ .env.example
├─ package.json
└─ tsconfig.json
```

## El puente de almacenamiento

`StorageService` es la interfaz; `R2StorageService` la implementa. El resto de la app
solo conoce la interfaz, así que cambiar de proveedor (S3, Backblaze, Supabase Storage)
es escribir otra clase y cambiar **una línea** en `R2StorageService.ts`:

```ts
export const storage: StorageService = new R2StorageService();
```

## Endpoints

> **Todos los endpoints requieren rol de administrador** (`Authorization: Bearer <token>` + `role: admin`).
> Sin token válido de admin → `401 Unauthorized` o `403 Forbidden`.
> No hay acceso público ni para usuarios regulares.

| Método | Ruta | Acceso | Qué hace |
|---|---|---|---|
| GET  | `/api/tracks?page=1&limit=20&search=...` | admin | Lista paginada + búsqueda por título |
| GET  | `/api/tracks/:id` | admin | Detalle de una canción |
| GET  | `/api/tracks/:id/stream` | admin | `302` → URL firmada de R2 (reproducir) |
| GET  | `/api/tracks/:id/download` | admin | `302` → URL firmada que fuerza descarga |
| POST | `/api/tracks` | admin | Crea registro y devuelve `uploadUrl` (PUT directo a R2) |
| POST | `/api/tracks/:id/publish` | admin | Marca `is_published` tras subir el archivo |
| GET  | `/api/admin/tracks?page=1&limit=20&search=...&status=draft\|published\|all` | admin | Lista tracks (default: draft) |
| GET  | `/api/admin/tracks/:id` | admin | Detalle (incluye borradores) |
| GET  | `/api/admin/tracks/:id/stream` | admin | `302` → URL firmada (preview de borrador) |

### Flujo de subida (eficiente, sin pasar bytes por el servidor)
1. Admin → `POST /api/tracks` con `{ title, contentType, ... }` → recibe `{ track, uploadUrl }`.
2. Admin → `PUT <uploadUrl>` con el archivo → sube **directo a R2**.
3. Admin → `POST /api/tracks/:id/publish` → la canción queda visible.

## Puesta en marcha

```bash
npm install
cp .env.example .env      # y llena los valores
# 1) En Supabase: ejecuta schema.sql en el SQL Editor
# 2) En Cloudflare R2: crea el bucket privado "chaosbeats-audio" y unas API keys (S3)
npm run dev               # desarrollo
npm run build && npm start# producción
```

### Variables de entorno
Ver `.env.example`. `SUPABASE_JWT_SECRET` es opcional (solo para HS256 legacy).
Para marcar a alguien como admin, ponle `app_metadata.role = "admin"` (Supabase Auth).

### CORS (Cloudflare R2)
Para subir desde el panel admin (React + Vite) con `PUT` a la `uploadUrl`, configura CORS en el bucket R2:

```json
[
  {
    "AllowedOrigins": ["http://localhost:5173", "https://TU-ADMIN.netlify.app"],
    "AllowedMethods": ["GET", "PUT"],
    "AllowedHeaders": ["content-type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

## Notas de eficiencia
- **`302` a URL firmada**, no proxy de bytes → el servidor no consume egress ni se satura.
- **Range requests**: R2 + el reproductor manejan el seek y solo bajan lo que suena.
- **`count: "estimated"`** en el listado → evita el `COUNT` exacto (caro) en tablas grandes.
- **Índices `pg_trgm`** sobre `title`/`name` → búsqueda `ILIKE` con índice GIN.
- **Descargas offline**: una vez en el dispositivo, las repeticiones cuestan $0 de ancho de banda.

## Seguridad
- **Acceso exclusivo para administradores**. Todos los endpoints requieren `role: admin`.
- Las llaves (service role, R2) viven **solo** en variables de entorno, nunca en el repo.
- Bucket R2 **privado**: el acceso es solo por URLs firmadas de TTL corto.
- RLS activo en `playlists`/`playlist_tracks`.
- El contenido de esta API es **privado y confidencial**. Cualquier intento de acceso no autorizado será rechazado con `401 Unauthorized` o `403 Forbidden`.

## Pendiente / siguiente
- **Playlists y favoritos**: el `schema.sql` ya los incluye. Los endpoints siguen el mismo
  patrón (service → controller → route) usando `supabaseForUser(token)` para que RLS aplique.
- **Donativos**: se integran después (endpoint + webhook), pendientes del SAT.
