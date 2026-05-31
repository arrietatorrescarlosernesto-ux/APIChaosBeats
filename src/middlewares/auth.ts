import { Request, Response, NextFunction } from "express";
import { supabaseAdmin } from "../config/supabase";
import { AuthUser } from "../types";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
      accessToken?: string;
    }
  }
}

interface SupabaseJwt {
  sub: string;
  email?: string;
}

// Verifica el JWT de Supabase LOCALMENTE (sin round-trip de red) => eficiente.
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    res.status(401).json({ error: "Falta el token Bearer" });
    return;
  }
  const token = header.slice(7);
  const { data, error } = await supabaseAdmin.auth.getClaims(token);
  if (error || !data?.claims) {
    res.status(401).json({ error: "Token inválido o expirado" });
    return;
  }

  const claims = data.claims as unknown as SupabaseJwt;
  if (!claims.sub) {
    res.status(401).json({ error: "Token inválido o expirado" });
    return;
  }

  req.user = { id: claims.sub, email: claims.email };
  req.accessToken = token;
  next();
}

export async function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Falta autenticación" });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("rol,banned")
      .eq("id", userId)
      .maybeSingle();

    if (error) throw error;
    if (!data || data.rol !== "admin" || data.banned === true) {
      res.status(403).json({ error: "Requiere rol de administrador" });
      return;
    }

    next();
  } catch (err) {
    next(err);
  }
}
