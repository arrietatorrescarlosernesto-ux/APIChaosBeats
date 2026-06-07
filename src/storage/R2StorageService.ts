import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { StorageService } from "./StorageService";
import { env } from "../config/env";

// Implementación para Cloudflare R2 (habla la API de S3).
export class R2StorageService implements StorageService {
  private client = new S3Client({
    region: "auto",
    endpoint: env.R2_ENDPOINT,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
  });

  getStreamUrl(key: string, expiresIn = env.SIGNED_URL_TTL): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: env.R2_BUCKET,
        Key: key,
        ResponseContentType: "audio/mpeg",
      }),
      { expiresIn },
    );
  }

  getDownloadUrl(key: string, filename: string, expiresIn = env.SIGNED_URL_TTL): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: env.R2_BUCKET,
        Key: key,
        ResponseContentDisposition: `attachment; filename="${filename}"`,
      }),
      { expiresIn },
    );
  }

  getUploadUrl(key: string, contentType: string, expiresIn = env.SIGNED_URL_TTL): Promise<string> {
    return getSignedUrl(
      this.client,
      new PutObjectCommand({ Bucket: env.R2_BUCKET, Key: key, ContentType: contentType }),
      { expiresIn },
    );
  }

  async remove(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: env.R2_BUCKET, Key: key }));
  }
}

// Punto ÚNICO de selección de proveedor.
// Para cambiar a S3 / Backblaze / Supabase Storage: implementa StorageService y cambia esta línea.
export const storage: StorageService = new R2StorageService();
