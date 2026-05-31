import { Request, Response } from "express";

export function list(_req: Request, res: Response): void {
  res.status(501).json({ error: "pendiente: modelo de artistas con Dev 1" });
}
