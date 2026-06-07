import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../config/supabase";

const updateProfileBody = z.object({
  username: z.string().trim().min(1).max(50).optional(),
  display_name: z.string().trim().min(1).max(100).optional(),
  bio: z.string().trim().max(500).optional(),
  avatar_url: z.string().url().optional().nullable(),
  location: z.string().trim().max(100).optional(),
  website: z.string().url().optional().nullable(),
});

const socialLinkBody = z.object({
  platform: z.string().trim().min(1).max(50),
  url: z.string().url(),
  display_order: z.number().int().min(0).default(0),
});

export async function getMyProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Falta autenticación" });
      return;
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();

    if (profileError) throw profileError;

    const { data: socialLinks, error: linksError } = await supabaseAdmin
      .from("social_links")
      .select("*")
      .eq("user_id", userId)
      .order("display_order", { ascending: true });

    if (linksError) throw linksError;

    res.json({ profile, social_links: socialLinks ?? [] });
  } catch (err) {
    next(err);
  }
}

export async function updateMyProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Falta autenticación" });
      return;
    }

    const body = updateProfileBody.parse(req.body);

    const { data, error } = await supabaseAdmin
      .from("profiles")
      .upsert({ id: userId, ...body, updated_at: new Date().toISOString() })
      .select("*")
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function addSocialLink(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Falta autenticación" });
      return;
    }

    const body = socialLinkBody.parse(req.body);

    const { data, error } = await supabaseAdmin
      .from("social_links")
      .upsert({ user_id: userId, ...body })
      .select("*")
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
}

export async function removeSocialLink(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Falta autenticación" });
      return;
    }

    const { error } = await supabaseAdmin
      .from("social_links")
      .delete()
      .eq("id", req.params.id)
      .eq("user_id", userId);

    if (error) throw error;
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function getProfileByUsername(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { username } = req.params;

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .eq("username", username)
      .maybeSingle();

    if (profileError) throw profileError;
    if (!profile) {
      res.status(404).json({ error: "Perfil no encontrado" });
      return;
    }

    const { data: socialLinks, error: linksError } = await supabaseAdmin
      .from("social_links")
      .select("*")
      .eq("user_id", profile.id)
      .order("display_order", { ascending: true });

    if (linksError) throw linksError;

    res.json({ profile, social_links: socialLinks ?? [] });
  } catch (err) {
    next(err);
  }
}
