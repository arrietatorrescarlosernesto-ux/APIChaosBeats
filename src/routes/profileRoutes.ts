import { Router } from "express";
import { requireAuth } from "../middlewares/auth";
import * as profile from "../controllers/profileController";

export const profileRoutes = Router();

profileRoutes.get("/me", requireAuth, profile.getMyProfile);
profileRoutes.patch("/me", requireAuth, profile.updateMyProfile);
profileRoutes.post("/me/social-links", requireAuth, profile.addSocialLink);
profileRoutes.delete("/me/social-links/:id", requireAuth, profile.removeSocialLink);
profileRoutes.get("/:username", profile.getProfileByUsername);
