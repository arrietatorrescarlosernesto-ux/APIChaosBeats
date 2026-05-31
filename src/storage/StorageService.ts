// El PUENTE: interfaz agnóstica de proveedor.
// El resto de la app depende SOLO de esto, nunca de R2 directamente.
export interface StorageService {
  /** URL firmada temporal para reproducir (streaming con Range requests). */
  getStreamUrl(key: string, expiresIn?: number): Promise<string>;
  /** URL firmada que fuerza la descarga del archivo. */
  getDownloadUrl(key: string, filename: string, expiresIn?: number): Promise<string>;
  /** URL firmada para que el cliente SUBA el archivo directo (PUT), sin pasar por el servidor. */
  getUploadUrl(key: string, contentType: string, expiresIn?: number): Promise<string>;
  /** Elimina un objeto. */
  remove(key: string): Promise<void>;
}
